import { DeserializedCommand } from '../CommandBase'
import { AtemState } from '../../state'
import { DownstreamKeyerProperties } from '../../state/video/downstreamKeyers'

export class DownstreamKeyPropertiesCommand extends DeserializedCommand<DownstreamKeyerProperties> {
	public static readonly rawName = 'DskP'

	public readonly downstreamKeyerId: number

	constructor (downstreamKeyerId: number, properties: DownstreamKeyerProperties) {
		super(properties)

		this.downstreamKeyerId = downstreamKeyerId
	}

	public static deserialize (rawCommand: Buffer) {
		const downstreamKeyerId = rawCommand.readUInt8(0)
		const properties = {
			tie: rawCommand.readUInt8(1) === 1,
			rate: rawCommand.readUInt8(2),

			preMultiply: rawCommand.readUInt8(3) === 1,
			clip: rawCommand.readUInt16BE(4),
			gain: rawCommand.readUInt16BE(6),
			invert: rawCommand.readUInt8(8) === 1,

			mask: {
				enabled: rawCommand.readUInt8(9) === 1,
				top: rawCommand.readInt16BE(10),
				bottom: rawCommand.readInt16BE(12),
				left: rawCommand.readInt16BE(14),
				right: rawCommand.readInt16BE(16)
			}
		}

		return new DownstreamKeyPropertiesCommand(downstreamKeyerId, properties)
	}

	public applyToState (state: AtemState) {
		if (!state.info.capabilities || this.downstreamKeyerId >= state.info.capabilities.downstreamKeyers) {
			throw new Error(`DownstreamKeyer ${this.downstreamKeyerId} is not valid`)
		}

		state.video.getDownstreamKeyer(this.downstreamKeyerId).properties = this.properties
		return `video.downstreamKeyers.${this.downstreamKeyerId}`
	}
}
