/**
 * Create the undo bottom-bar controller. The bar is visible only while an undo
 * is available; its button restores the last deleted entry.
 * @param {object} opts
 * @param {object} opts.store - The store instance (Task 3).
 * @returns {{render: () => void}}
 */
export function createBottomBar({ store }) {
  const bar = document.getElementById("bottom-bar");
  const btn = document.getElementById("undo-btn");
  btn.addEventListener("click", () => store.undo());

  return {
    /** Show or hide the bar based on undo availability. */
    render() {
      bar.hidden = !store.canUndo();
    },
  };
}
