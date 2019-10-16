import { AtemState } from '../state'
import * as Enums from '../enums'

/**
 * Emulates the ATEM's own tally logic as it appears
 * in the ATEM multiviewer.
 *
 * Useful for any code which needs a full list of all
 * sources present in Preview and/or Program.
 */
export function listVisibleInputs (mode: 'program' | 'preview', state: AtemState, me = 0): number[] {
	const inputs = new Set<number>()

	// Start with the basics: the surface level of what is in the target ME.
	_calcActiveMeInputs(mode, state, me).forEach(i => inputs.add(i))

	// Loop over the active input IDs we've found so far,
	// and check if any of them are SuperSources or other nested MEs.
	// If so, iterate through them and find out what they are showing.
	// Keep looping until we stop discovering new things.
	let lastSize: number
	let lastProcessed = 0
	do {
		// Only processes inputs we haven't already processed.
		// This is an important optimization because this function could potentially
		// be in a hot code path and get called many many times a second,
		// every time the ATEM's state updates.
		lastSize = inputs.size
		Array.from(inputs).slice(lastProcessed).forEach(inputId => {
			if (!state.inputs[inputId]) {
				// Data isn't hydrated yet, we'll get 'em next time.
				return
			}
			const portType = state.inputs[inputId].internalPortType
			switch (portType) {
				case Enums.InternalPortType.SuperSource:
					const ssrcId = inputId - 6000
					const ssrc = state.video.getSuperSource(ssrcId)
					Object.values(ssrc.boxes).forEach(box => {
						if (box.enabled) {
							inputs.add(box.source)
						}
					})

					inputs.add(ssrc.properties.artFillSource)
					if (ssrc.properties.artOption === Enums.SuperSourceArtOption.Foreground) {
						inputs.add(ssrc.properties.artCutSource)
					}
					break
				case Enums.InternalPortType.MEOutput:
					const nestedMeId = ((inputId - (inputId % 10)) - 10000) / 10 - 1
					const nestedMeMode = (inputId - 10000) % 10 === 0 ? 'program' : 'preview'
					_calcActiveMeInputs(nestedMeMode, state, nestedMeId).forEach(i => inputs.add(i))
					break
				default:
					// Do nothing.
			}
		})
		lastProcessed = inputs.size - 1
	} while (inputs.size !== lastSize)

	// undefined sometimes sneaks its way in here.
	// Don't know why.
	return Array.from(inputs).filter((i: unknown) => typeof i === 'number').sort((a, b) => a - b)
}

/**
 * Helper method used by listVisibleInputs.
 * This got broken out into its own method because
 * it gets called multiple times, and gets called in a loop.
 * Breaking it out made listVisibleInputs much easier to read.
 */
function _calcActiveMeInputs (mode: 'program' | 'preview', state: AtemState, meId: number): number[] {
	const inputs = new Set<number>()
	const meRef = state.video.getMe(meId)

	if (mode === 'preview') {
		if (meRef.transitionProperties.selection & 1) {
			inputs.add(meRef.previewInput)
		}
	} else {
		inputs.add(meRef.programInput)
	}

	// Upstream Keyers
	Object.values(meRef.upstreamKeyers).filter(usk => {
		const keyerMask = 1 << (usk.upstreamKeyerId + 1)
		const isPartOfTransition = meRef.transitionProperties.selection & keyerMask
		if (mode === 'program') { // TODO - verify these conditions
			if (meRef.inTransition) {
				return usk.onAir || isPartOfTransition
			}

			return usk.onAir
		}

		return (isPartOfTransition && !usk.onAir) || (usk.onAir && !isPartOfTransition)
	}).forEach(usk => {
		inputs.add(usk.fillSource)

		// This is the only USK type that actually uses the cutSource.
		if (usk.mixEffectKeyType === Enums.MixEffectKeyType.Luma) {
			inputs.add(usk.cutSource)
		}
	})

	// DSKs only show up on ME 1,
	// so we only add them if that's the ME we are currently processing.
	if (meId === 0) {
		Object.values(state.video.downstreamKeyers).filter(dsk => {
			if (mode === 'program') {
				return dsk.onAir || dsk.inTransition
			}

			if (!dsk.properties) {
				// Data isn't hydrated yet, we'll get 'em next time.
				return false
			}

			return dsk.properties.tie && !dsk.onAir
		}).forEach(dsk => {
			inputs.add(dsk.sources.fillSource)
			inputs.add(dsk.sources.cutSource)
		})
	}

	// Compute what sources are currently participating in a transition.
	if ((meRef.inTransition && mode === 'program') || (mode === 'preview' && meRef.transitionPosition > 0)) {
		if (meRef.transitionProperties.selection & 1) {
			inputs.add(meRef.previewInput)
		}

		// From here, what inputs are participating in the transition depends
		// on the transition style being used, so we handle each separately.
		switch (meRef.transitionProperties.style) {
			case Enums.TransitionStyle.DIP:
				inputs.add(meRef.transitionSettings.dip.input)
				break
			case Enums.TransitionStyle.DVE:
				inputs.add(meRef.transitionSettings.DVE.fillSource)
				if (meRef.transitionSettings.DVE.enableKey) {
					inputs.add(meRef.transitionSettings.DVE.keySource)
				}
				break
			case Enums.TransitionStyle.WIPE:
				if (meRef.transitionSettings.wipe.borderWidth > 0) {
					inputs.add(meRef.transitionSettings.wipe.borderInput)
				}
				break
			case Enums.TransitionStyle.STING:
				const mediaPlayerIndex = meRef.transitionSettings.stinger.source
				const fillInputId = 3000 + (mediaPlayerIndex * 10)
				const keyInputId = fillInputId + 1
				inputs.add(fillInputId)
				inputs.add(keyInputId)
				break
			default:
				// Do nothing.
				// This is the code path that MIX will take.
				// It's already handled above when we add the previewInput
				// to the activeInputs array.
		}
	}

	return Array.from(inputs)
}