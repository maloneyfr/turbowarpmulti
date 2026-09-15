/**
 * VM Listener — Intercepts scratch-vm changes and converts them to
 * collaboration operations. Also applies incoming remote operations
 * to the local VM.
 */
const {OP, createOp} = require('./operations');

class CollabVMListener {
    constructor (vm, collabManager) {
        this.vm = vm;
        this.collab = collabManager;
        this._attached = false;
        this._originalBlockListener = null;
        this._originalFlyoutBlockListener = null;
        this._lastEditingTarget = null;

        this._onTargetsUpdate = this._onTargetsUpdate.bind(this);
        this._onRemoteOperation = this._onRemoteOperation.bind(this);
    }

    attach () {
        if (this._attached) return;
        this._attached = true;

        // Hook into the block listener by wrapping it
        this._patchBlockListener();
        
        // Hook into RenderedTarget for sprite property changes (movement, size, etc.)
        this._patchTargetMethods();

        // Listen for target changes
        this.vm.on('targetsUpdate', this._onTargetsUpdate);

        // Listen for editing target changes (cursor tracking)
        this._setupCursorTracking();

        // Listen for remote operations from CollabManager
        this.collab.on('remoteOperation', this._onRemoteOperation);
    }

    detach () {
        if (!this._attached) return;
        this._attached = false;

        // Restore original block listener
        this._unpatchBlockListener();
        
        // We do not unpatch Target methods as it might affect other things, or we can carefully restore them.
        this._unpatchTargetMethods();

        this.vm.removeListener('targetsUpdate', this._onTargetsUpdate);
        this.collab.removeListener('remoteOperation', this._onRemoteOperation);
    }

    // ---- Block listener patching ----

    _patchBlockListener () {
        // The VM's blockListener is called by scratch-blocks for every workspace event.
        // We wrap it to intercept block changes.
        this._originalBlockListener = this.vm.blockListener;

        this.vm.blockListener = e => {
            // Call original first
            if (this._originalBlockListener) {
                this._originalBlockListener(e);
            }

            // Prevent infinite loop: ignore events spawned by our remote sync
            if (e.group === 'remote_sync') return;
            if (this.collab.isRemoteOperation) return;

            // Convert workspace event to collab operation
            this._handleBlockEvent(e);
        };
    }

    _unpatchBlockListener () {
        if (this._originalBlockListener) {
            this.vm.blockListener = this._originalBlockListener;
            this._originalBlockListener = null;
        }
    }

    _patchTargetMethods () {
        if (!this.vm.runtime.targets.length) return;
        const targetProto = Object.getPrototypeOf(this.vm.runtime.targets[0]);
        if (targetProto._collabPatched) return;
        targetProto._collabPatched = true;

        const methodsToPatch = [
            'setXY', 'setDirection', 'setSize', 'setVisible', 'setDraggable', 'setRotationStyle'
        ];

        this._originalTargetMethods = {};

        methodsToPatch.forEach(method => {
            if (typeof targetProto[method] === 'function') {
                this._originalTargetMethods[method] = targetProto[method];
                const self = this;
                targetProto[method] = function (...args) {
                    const result = self._originalTargetMethods[method].apply(this, args);
                    if (self._attached && !self.collab.isRemoteOperation) {
                        let prop = method.toLowerCase().replace('set', '');
                        let value = args[0];
                        
                        if (method === 'setXY') {
                            self.collab.broadcastOp(createOp(OP.SPRITE_PROPERTY, { targetId: this.id, prop: 'x', value: args[0] }));
                            self.collab.broadcastOp(createOp(OP.SPRITE_PROPERTY, { targetId: this.id, prop: 'y', value: args[1] }));
                            return result;
                        }
                        
                        // Map specific props
                        if (method === 'setRotationStyle') prop = 'rotationStyle';
                        
                        self.collab.broadcastOp(createOp(OP.SPRITE_PROPERTY, {
                            targetId: this.id,
                            prop: prop,
                            value: value
                        }));
                    }
                    return result;
                };
            }
        });
    }

    _unpatchTargetMethods () {
        if (!this.vm.runtime.targets.length || !this._originalTargetMethods) return;
        const targetProto = Object.getPrototypeOf(this.vm.runtime.targets[0]);
        
        for (const method in this._originalTargetMethods) {
            targetProto[method] = this._originalTargetMethods[method];
        }
        targetProto._collabPatched = false;
        this._originalTargetMethods = null;
    }

    _handleBlockEvent (e) {
        if (!this.collab.isInSession()) return;
        if (!this.vm.editingTarget) return;

        // Skip UI events
        if (e.type === 'ui' || e.element === 'stackclick') return;

        if (typeof e.toJson === 'function') {
            const op = createOp(OP.BLOCK_EVENT, e.toJson(), this.collab.myPeerId);
            this.collab.broadcastOp(op);
        }
    }

    // ---- Target (sprite) tracking ----

    _onTargetsUpdate () {
        // This gets called whenever targets change.
        // We use the full project sync approach for major changes.
        // Individual sprite property changes are captured elsewhere.
    }

    _setupCursorTracking () {
        // Poll for editing target changes (no specific event for this)
        this._cursorInterval = setInterval(() => {
            if (!this.collab.isInSession()) return;
            const currentTarget = this.vm.editingTarget;
            if (currentTarget && currentTarget.id !== this._lastEditingTarget) {
                this._lastEditingTarget = currentTarget.id;
                this.collab.updateCursorTarget(currentTarget.id);
            }
        }, 500);
    }

    // ---- Apply remote operations to local VM ----

    _onRemoteOperation (op) {
        this.collab._isRemoteOperation = true;
        try {
            switch (op.type) {
            case OP.BLOCK_EVENT:
                this._applyBlockEvent(op.payload);
                break;
            case OP.SPRITE_ADD:
                this._applySpriteAdd(op.payload);
                break;
            case OP.SPRITE_DELETE:
                this._applySpriteDelete(op.payload);
                break;
            case OP.SPRITE_RENAME:
                this._applySpriteRename(op.payload);
                break;
            case OP.SPRITE_PROPERTY:
                this._applySpriteProperty(op.payload);
                break;
            case OP.COSTUME_ADD:
                this._applyCostumeAdd(op.payload);
                break;
            case OP.COSTUME_DELETE:
                this._applyCostumeDelete(op.payload);
                break;
            case OP.COSTUME_CHANGE:
                this._applyCostumeChange(op.payload);
                break;
            case OP.SOUND_ADD:
                this._applySoundAdd(op.payload);
                break;
            case OP.SOUND_DELETE:
                this._applySoundDelete(op.payload);
                break;
            case OP.VARIABLE_CREATE:
                this._applyVariableCreate(op.payload);
                break;
            case OP.VARIABLE_DELETE:
                this._applyVariableDelete(op.payload);
                break;
            case OP.VARIABLE_RENAME:
                this._applyVariableRename(op.payload);
                break;
            case OP.PROJECT_RENAME:
                this.vm.emit('PROJECT_TITLE_CHANGED', op.payload.name);
                break;
            default:
                break;
            }
        } catch (err) {
            console.error('Failed to apply remote operation:', op.type, err);
        } finally {
            this.collab._isRemoteOperation = false;
        }

        // Only force full workspace refresh for structural changes
        if (op.type !== OP.BLOCK_EVENT && op.type !== OP.SPRITE_PROPERTY && op.type !== OP.CURSOR_MOVE) {
            this.vm.emitWorkspaceUpdate();
        }
        
        // Always update targets and redraw stage
        this.vm.emitTargetsUpdate(false);
        this.vm.runtime.requestRedraw();
    }

    _findTarget (targetId) {
        return this.vm.runtime.targets.find(t => t.id === targetId);
    }

    _applyBlockEvent (payload) {
        if (!window.ScratchBlocks) return;
        const workspace = window.ScratchBlocks.getMainWorkspace();
        if (!workspace) return;
        try {
            const event = window.ScratchBlocks.Events.fromJson(payload, workspace);
            // Run forward natively. We set a custom group so the patched blockListener
            // can ignore the resulting async events and avoid infinite loops.
            const prevGroup = window.ScratchBlocks.Events.getGroup();
            window.ScratchBlocks.Events.setGroup('remote_sync');
            event.run(true);
            window.ScratchBlocks.Events.setGroup(prevGroup);
        } catch (err) {
            console.error('Failed to apply remote block event:', err);
        }
    }

    _applySpriteAdd (payload) {
        // The sprite data should be a JSON blob we can pass to addSprite
        if (payload.spriteJson) {
            this.vm.addSprite(payload.spriteJson);
        }
    }

    _applySpriteDelete (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        this.vm.deleteSprite(target.id);
    }

    _applySpriteRename (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        this.vm.renameSprite(target.id, payload.newName);
    }

    _applySpriteProperty (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;

        const prop = payload.prop;
        const value = payload.value;

        switch (prop) {
        case 'x':
            target.setXY(value, target.y);
            break;
        case 'y':
            target.setXY(target.x, value);
            break;
        case 'direction':
            target.setDirection(value);
            break;
        case 'size':
            target.setSize(value);
            break;
        case 'visible':
            target.setVisible(value);
            break;
        case 'draggable':
            target.setDraggable(value);
            break;
        case 'rotationStyle':
            target.setRotationStyle(value);
            break;
        default:
            break;
        }
    }

    _applyCostumeAdd (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        if (payload.costumeData) {
            this.vm.addCostume(
                payload.costumeData.md5ext || '',
                payload.costumeData,
                target.id
            );
        }
    }

    _applyCostumeDelete (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        this.vm.deleteCostume(target.id, payload.costumeIndex);
    }

    _applyCostumeChange (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        target.setCostume(payload.costumeIndex);
    }

    _applySoundAdd (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        if (payload.soundData) {
            this.vm.addSound(payload.soundData, target.id);
        }
    }

    _applySoundDelete (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        this.vm.deleteSound(target.id, payload.soundIndex);
    }

    _applyVariableCreate (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        target.createVariable(payload.varId, payload.varName, payload.varType || '');
    }

    _applyVariableDelete (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        target.deleteVariable(payload.varId);
    }

    _applyVariableRename (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;
        target.renameVariable(payload.varId, payload.newName);
    }

    destroy () {
        this.detach();
        if (this._cursorInterval) {
            clearInterval(this._cursorInterval);
        }
    }
}

module.exports = CollabVMListener;
