/**
 * Callback ref that stops `pointerdown` from reaching an ancestor drag handler.
 *
 * framer-motion's `Reorder.Item` attaches NATIVE pointer listeners to the card element, but
 * React 18 dispatches synthetic events from the root container — by the time a React
 * `onPointerDown` handler runs, the native event has already bubbled past the card and the pan
 * session has started. Swallowing the event on the node itself is the only thing that lands in
 * time. `click` is a separate native event, so it still fires normally.
 *
 * Attach to any interactive control rendered inside a `Reorder.Item`.
 */
export const blockDragFromNode = (node: HTMLElement | null): void => {
  node?.addEventListener("pointerdown", (event) => event.stopPropagation());
};
