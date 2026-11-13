import satori from "satori";
import { SITE } from "@/config";
import loadGoogleFonts from "../loadGoogleFont";
import { frame, HEIGHT, WIDTH } from "./frame";

export default async () => {
  return satori(
    frame({
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          margin: "20px",
          width: "90%",
          height: "90%",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                height: "90%",
                maxHeight: "90%",
                overflow: "hidden",
                textAlign: "center",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      margin: "16px 0",
                      fontSize: 72,
                      fontWeight: "bold",
                    },
                    children: SITE.title,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { margin: "16px 0", fontSize: 28 },
                    children: SITE.desc,
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "flex-end",
                width: "100%",
                marginBottom: "8px",
                fontSize: 28,
              },
              children: {
                type: "span",
                props: {
                  style: { overflow: "hidden", fontWeight: "bold" },
                  children: new URL(SITE.website).hostname,
                },
              },
            },
          },
        ],
      },
    }),
    {
      width: WIDTH,
      height: HEIGHT,
      embedFont: true,
      fonts: await loadGoogleFonts(SITE.title + SITE.desc + SITE.website),
    }
  );
};
