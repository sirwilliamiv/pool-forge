'use client'

import { Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import type Konva from 'konva'
import { useSurveyStore } from '@/modules/editor/state/surveyStore'

const PIXELS_PER_INCH = 2 // mirror CanvasStageInner

export function SurveyLayer() {
  const survey = useSurveyStore((s) => s.survey)
  const patchSurvey = useSurveyStore((s) => s.patchSurvey)
  const [image] = useImage(survey?.imageDataUrl ?? '')

  if (!survey) return null
  if (!image) return null

  return (
    <KonvaImage
      image={image}
      x={survey.x * PIXELS_PER_INCH}
      y={survey.y * PIXELS_PER_INCH}
      width={survey.widthInches * PIXELS_PER_INCH}
      height={survey.heightInches * PIXELS_PER_INCH}
      opacity={survey.opacity}
      listening={!survey.locked}
      draggable={!survey.locked}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target
        patchSurvey({
          x: node.x() / PIXELS_PER_INCH,
          y: node.y() / PIXELS_PER_INCH,
        })
      }}
    />
  )
}
