// The frame both social-preview images share: a white card with a black
// border, and a grey "shadow" card behind it, offset up and to the right.
//
// Every box is placed by explicit pixel coordinates, and the two cards
// are both `position: absolute`. CSS paints positioned siblings in
// document order, so the shadow (first) is always under the card
// (second). The earlier version made only the shadow absolute and left
// the card in the flow, which CSS paints the other way round: it looked
// right only because satori used to ignore that rule, and newer satori
// (0.34+) drew the shadow over the text.

/** The image, px. */
export const WIDTH = 1200;
export const HEIGHT = 630;

/** A card's border, px. */
const BORDER = 4;
/** A card, border included: 88% of the width, 80% of the height. */
const CARD = { width: 1056, height: 504 };
/** The front card is centred. */
const FRONT = { left: 72, top: 63 };
/** The shadow sits 33 px to the right and 24 px up. */
const SHADOW = { left: 105, top: 39 };

// `width` and `height` are given without the border, so the size doesn't
// depend on which box-sizing a renderer assumes.
const card = {
  position: "absolute",
  boxSizing: "content-box",
  width: CARD.width - 2 * BORDER,
  height: CARD.height - 2 * BORDER,
  border: `${BORDER}px solid #000`,
  borderRadius: "4px",
  display: "flex",
  justifyContent: "center",
};

/** The whole image's element tree, with `content` (one element) inside
 *  the front card. */
export function frame(content) {
  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        display: "flex",
        width: WIDTH,
        height: HEIGHT,
        background: "#fefbfb",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              ...card,
              ...SHADOW,
              background: "#ecebeb",
              opacity: "0.9",
            },
          },
        },
        {
          type: "div",
          props: {
            style: { ...card, ...FRONT, background: "#fefbfb" },
            children: content,
          },
        },
      ],
    },
  };
}
