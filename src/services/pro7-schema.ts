/**
 * ProPresenter 7 protobuf schema defined via protobufjs reflection API.
 * Field numbers sourced from the reverse-engineered greyshirtguy/ProPresenter7-Proto schema.
 */
import protobuf from 'protobufjs';

const { Root, Type, Field, Enum } = protobuf;

// ── Primitive / shared message types ──────────────────

const UUID = new Type('UUID')
  .add(new Field('string', 1, 'string'));

const Color = new Type('Color')
  .add(new Field('red', 1, 'double'))
  .add(new Field('green', 2, 'double'))
  .add(new Field('blue', 3, 'double'))
  .add(new Field('alpha', 4, 'double'));

const GraphicsPoint = new Type('Point')
  .add(new Field('x', 1, 'double'))
  .add(new Field('y', 2, 'double'));

const GraphicsSize = new Type('Size')
  .add(new Field('width', 1, 'double'))
  .add(new Field('height', 2, 'double'));

const GraphicsRect = new Type('Rect')
  .add(new Field('origin', 1, 'Point'))
  .add(new Field('size', 2, 'Size'));

// ── URL wrapper ──────────────────────────────────────

const URL = new Type('URL')
  .add(new Field('local_path', 1, 'string'))
  .add(new Field('external_path', 2, 'string'));

// ── Media ────────────────────────────────────────────

const Media = new Type('Media')
  .add(new Field('uuid', 1, 'UUID'))
  .add(new Field('url', 2, 'URL'));

// ── Graphics sub-messages ────────────────────────────

const VerticalAlignment = new Enum('VerticalAlignment', {
  TOP: 0,
  MIDDLE: 1,
  BOTTOM: 2,
});

const GraphicsText = new Type('Text')
  .add(VerticalAlignment)
  .add(new Field('rtf_data', 5, 'bytes'))
  .add(new Field('vertical_alignment', 6, 'int32'));

const GraphicsFill = new Type('Fill')
  .add(new Field('media', 3, 'Media'))
  .add(new Field('enable', 4, 'bool'));

const GraphicsElement = new Type('Element')
  .add(new Field('uuid', 1, 'UUID'))
  .add(new Field('name', 2, 'string'))
  .add(new Field('bounds', 3, 'Rect'))
  .add(new Field('opacity', 5, 'double'))
  .add(new Field('fill', 9, 'Fill'))
  .add(new Field('text', 13, 'Text'));

// ── Namespace: Graphics ──────────────────────────────
// Nest shared geometry types under a Graphics namespace so references resolve.

const Graphics = new Type('Graphics')
  .add(GraphicsPoint)
  .add(GraphicsSize)
  .add(GraphicsRect)
  .add(GraphicsText)
  .add(GraphicsFill)
  .add(GraphicsElement)
  .add(Media)
  .add(URL);

// ── Slide ────────────────────────────────────────────

const SlideElement = new Type('Element')
  .add(new Field('element', 1, 'Graphics.Element'));

const Slide = new Type('Slide')
  .add(new Field('elements', 1, 'Element', 'repeated'))
  .add(new Field('draws_background_color', 4, 'bool'))
  .add(new Field('background_color', 5, 'Color'))
  .add(new Field('size', 6, 'Graphics.Size'))
  .add(new Field('uuid', 7, 'UUID'))
  .add(SlideElement);

// ── Action ───────────────────────────────────────────

const ActionSlideType = new Type('SlideType')
  .add(new Field('presentation', 1, 'Presentation'))
  .add(new Field('slide', 2, 'Slide'));

const Action = new Type('Action')
  .add(new Field('uuid', 1, 'UUID'))
  .add(new Field('slide', 8, 'SlideType'))
  .add(ActionSlideType);

// ── Cue ──────────────────────────────────────────────

const Cue = new Type('Cue')
  .add(new Field('uuid', 1, 'UUID'))
  .add(new Field('name', 2, 'string'))
  .add(new Field('actions', 10, 'Action', 'repeated'))
  .add(new Field('isEnabled', 12, 'bool'));

// ── Group ────────────────────────────────────────────

const Group = new Type('Group')
  .add(new Field('uuid', 1, 'UUID'))
  .add(new Field('name', 2, 'string'))
  .add(new Field('color', 3, 'Color'));

// ── CueGroup ─────────────────────────────────────────

const CueGroup = new Type('CueGroup')
  .add(new Field('group', 1, 'Group'))
  .add(new Field('cue_identifiers', 2, 'UUID', 'repeated'));

// ── Presentation (top-level) ─────────────────────────

const Presentation = new Type('Presentation')
  .add(new Field('uuid', 2, 'UUID'))
  .add(new Field('name', 3, 'string'))
  .add(new Field('category', 6, 'string'))
  .add(new Field('cue_groups', 12, 'CueGroup', 'repeated'))
  .add(new Field('cues', 13, 'Cue', 'repeated'))
  .add(CueGroup)
  .add(Group);

// ── Root ─────────────────────────────────────────────

const root = new Root()
  .add(UUID)
  .add(Color)
  .add(Graphics)
  .add(Slide)
  .add(Action)
  .add(Cue)
  .add(Presentation);

// Resolve all type references
root.resolveAll();

export { root, Presentation, Cue, Action, Slide, GraphicsElement, GraphicsText, GraphicsFill, Media, UUID, Color, GraphicsSize, GraphicsRect, Group, CueGroup, SlideElement };
