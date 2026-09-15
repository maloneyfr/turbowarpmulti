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

            // If this is a remote operation, don't broadcast
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

        const targetId = this.vm.editingTarget.id;

        switch (e.type) {
        case 'create': {
            const op = createOp(OP.BLOCK_CREATE, {
                targetId,
                blockXml: e.xml ? (new XMLSerializer()).serializeToString(e.xml) : null,
                blockJson: e.json
            }, this.collab.myPeerId);
            this.collab.broadcastOp(op);
            break;
        }
        case 'change': {
            const op = createOp(OP.BLOCK_CHANGE, {
                targetId,
                blockId: e.blockId,
                element: e.element,
                name: e.name,
                newValue: e.newValue,
                oldValue: e.oldValue
            }, this.collab.myPeerId);
            this.collab.broadcastOp(op);
            break;
        }
        case 'move': {
            const op = createOp(OP.BLOCK_MOVE, {
                targetId,
                blockId: e.blockId,
                newParentId: e.newParentId,
                newInputName: e.newInputName,
                newCoordinate: e.newCoordinate,
                oldParentId: e.oldParentId,
                oldInputName: e.oldInputName,
                oldCoordinate: e.oldCoordinate
            }, this.collab.myPeerId);
            this.collab.broadcastOp(op);
            break;
        }
        case 'delete': {
            const op = createOp(OP.BLOCK_DELETE, {
                targetId,
                blockId: e.blockId,
                blockXml: e.oldXml ? (new XMLSerializer()).serializeToString(e.oldXml) : null,
                blockJson: e.oldJson
            }, this.collab.myPeerId);
            this.collab.broadcastOp(op);
            break;
        }
        case 'var_create': {
            const op = createOp(OP.VARIABLE_CREATE, {
                targetId,
                varId: e.varId,
                varName: e.varName,
                varType: e.varType
            }, this.collab.myPeerId);
            this.collab.broadcastOp(op);
            break;
        }
        case 'var_delete': {
            const op = createOp(OP.VARIABLE_DELETE, {
                targetId,
                varId: e.varId
            }, this.collab.myPeerId);
            this.collab.broadcastOp(op);
            break;
        }
        case 'var_rename': {
            const op = createOp(OP.VARIABLE_RENAME, {
                targetId,
                varId: e.varId,
                oldName: e.oldName,
                newName: e.newName
            }, this.collab.myPeerId);
            this.collab.broadcastOp(op);
            break;
        }
        default:
            break;
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
            case OP.BLOCK_CREATE:
                this._applyBlockCreate(op.payload);
                break;
            case OP.BLOCK_CHANGE:
                this._applyBlockChange(op.payload);
                break;
            case OP.BLOCK_MOVE:
                this._applyBlockMove(op.payload);
                break;
            case OP.BLOCK_DELETE:
                this._applyBlockDelete(op.payload);
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

        // Force workspace and UI to refresh
        this.vm.emitWorkspaceUpdate();
        this.vm.emitTargetsUpdate(false);
        this.vm.runtime.requestRedraw();
    }

    _findTarget (targetId) {
        return this.vm.runtime.targets.find(t => t.id === targetId);
    }

    _applyBlockCreate (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;

        if (payload.blockJson) {
            // Use the JSON representation to create blocks
            const blocks = payload.blockJson;
            if (typeof blocks === 'object') {
                for (const id in blocks) {
                    if (blocks.hasOwnProperty(id)) {
                        target.blocks.createBlock(blocks[id]);
                    }
                }
            }
        }
    }

    _applyBlockChange (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;

        target.blocks.changeBlock({
            id: payload.blockId,
            element: payload.element,
            name: payload.name,
            value: payload.newValue
        }, this.vm.runtime);
    }

    _applyBlockMove (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;

        target.blocks.moveBlock({
            id: payload.blockId,
            newParent: payload.newParentId,
            newInput: payload.newInputName,
            newCoordinate: payload.newCoordinate,
            oldParent: payload.oldParentId,
            oldInput: payload.oldInputName,
            oldCoordinate: payload.oldCoordinate
        });
    }

    _applyBlockDelete (payload) {
        const target = this._findTarget(payload.targetId);
        if (!target) return;

        target.blocks.deleteBlock(payload.blockId);
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
