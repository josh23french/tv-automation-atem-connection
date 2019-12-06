import { WritableCommand, DeserializedCommand } from '../../CommandBase'
import { AtemState } from '../../../state'
import { DVETransitionSettings } from '../../../state/video'

export class TransitionDVECommand extends WritableCommand<DVETransitionSettings> {
	public static MaskFlags = {
		rate: 1 << 0,
		logoRate: 1 << 1,
		style: 1 << 2,
		fillSource: 1 << 3,
		keySource: 1 << 4,
		enableKey: 1 << 5,
		preMultiplied: 1 << 6,
		clip: 1 << 7,
		gain: 1 << 8,
		invertKey: 1 << 9,
		reverse: 1 << 10,
		flipFlop: 1 << 11
	}

	public static readonly rawName = 'CTDv'

	public readonly mixEffect: number

	constructor (mixEffect: number) {
		super()

		this.mixEffect = mixEffect
	}

	public serialize () {
		const buffer = Buffer.alloc(20, 0)
		buffer.writeUInt16BE(this.flag, 0)

		buffer.writeUInt8(this.mixEffect, 2)
		buffer.writeUInt8(this.properties.rate || 0, 3)
		buffer.writeUInt8(this.properties.logoRate || 0, 4)
		buffer.writeUInt8(this.properties.style || 0, 5)

		buffer.writeUInt16BE(this.properties.fillSource || 0, 6)
		buffer.writeUInt16BE(this.properties.keySource || 0, 8)

		buffer.writeUInt8(this.properties.enableKey ? 1 : 0, 10)
		buffer.writeUInt8(this.properties.preMultiplied ? 1 : 0, 11)
		buffer.writeUInt16BE(this.properties.clip || 0, 12)
		buffer.writeUInt16BE(this.properties.gain || 0, 14)
		buffer.writeUInt8(this.properties.invertKey ? 1 : 0, 16)
		buffer.writeUInt8(this.properties.reverse ? 1 : 0, 17)
		buffer.writeUInt8(this.properties.flipFlop ? 1 : 0, 18)

		return buffer
	}
}

export class TransitionDVEUpdateCommand extends DeserializedCommand<DVETransitionSettings> {
	public static readonly rawName = 'TDvP'

	public readonly mixEffect: number

	constructor (mixEffect: number, properties: DVETransitionSettings) {
		super(properties)

		this.mixEffect = mixEffect
	}

	public static deserialize (rawCommand: Buffer): TransitionDVEUpdateCommand {
		const mixEffect = rawCommand[0]
		const properties = {
			rate: rawCommand[1],
			logoRate: rawCommand[2],
			style: rawCommand.readUInt8(3),
			fillSource: rawCommand[4] << 8 | (rawCommand[5] & 0xff),
			keySource: rawCommand[6] << 8 | (rawCommand[7] & 0xff),

			enableKey: rawCommand[8] === 1,
			preMultiplied: rawCommand[9] === 1,
			clip: rawCommand.readUInt16BE(10),
			gain: rawCommand.readUInt16BE(12),
			invertKey: rawCommand[14] === 1,
			reverse: rawCommand[15] === 1,
			flipFlop: rawCommand[16] === 1
		}

		return new TransitionDVEUpdateCommand(mixEffect, properties)
	}

	public applyToState (state: AtemState) {
		const mixEffect = state.video.getMe(this.mixEffect)
		mixEffect.transitionSettings.DVE = {
			...this.properties
		}
		return `video.ME.${this.mixEffect}.transitionSettings.DVE`
	}
}
