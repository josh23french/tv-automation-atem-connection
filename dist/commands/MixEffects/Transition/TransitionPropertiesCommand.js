"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommand_1 = require("../../AbstractCommand");
const __1 = require("../../..");
class TransitionPropertiesCommand extends AbstractCommand_1.default {
    constructor() {
        super(...arguments);
        this.rawName = 'TrSS';
    }
    updateProps(newProps) {
        this._updateProps(newProps);
    }
    deserialize(rawCommand) {
        this.mixEffect = __1.Util.parseNumberBetween(rawCommand[0], 0, 3);
        this.properties = {
            style: __1.Util.parseEnum(rawCommand[1], __1.Enums.TransitionStyle),
            selection: rawCommand[2],
            nextStyle: __1.Util.parseEnum(rawCommand[3], __1.Enums.TransitionStyle),
            nextSelection: rawCommand[4]
        };
    }
    serialize() {
        const rawCommand = 'CTTp';
        const buffer = new Buffer(8);
        buffer.fill(0);
        Buffer.from(rawCommand).copy(buffer, 0);
        buffer.writeUInt8(this.flag, 4);
        buffer.writeUInt8(this.mixEffect, 5);
        buffer.writeUInt8(this.properties.style, 6);
        buffer.writeUInt8(this.properties.selection, 7);
        return buffer;
    }
    applyToState(state) {
        const mixEffect = state.video.getMe(this.mixEffect);
        mixEffect.transitionProperties = Object.assign({}, this.properties);
    }
}
TransitionPropertiesCommand.MaskFlags = {
    style: 1 << 0,
    selection: 1 << 1
};
exports.TransitionPropertiesCommand = TransitionPropertiesCommand;
//# sourceMappingURL=TransitionPropertiesCommand.js.map