import satori from "satori";
import { SITE } from "@/config";
import loadGoogleFonts from "../loadGoogleFont";
import { frame, HEIGHT, WIDTH } from "./frame";

export default async post => {
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
                // A paragraph's usual margins, given outright.
                margin: "16px 0",
                fontSize: 72,
                fontWeight: "bold",
                maxHeight: "84%",
                overflow: "hidden",
              },
              children: post.data.title,
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                width: "100%",
                marginBottom: "8px",
                fontSize: 28,
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: { display: "flex" },
                    children: [
                      "by",
                      {
                        type: "span",
                        props: {
                          style: {
                            // The gap after "by", given outright: how a
                            // trailing space is drawn varies by renderer.
                            marginLeft: 17,
                            overflow: "hidden",
                            fontWeight: "bold",
                          },
                          children: post.data.author,
                        },
                      },
                    ],
                  },
                },
                {
                  type: "span",
                  props: {
                    style: { overflow: "hidden", fontWeight: "bold" },
                    children: SITE.title,
                  },
                },
              ],
            },
          },
        ],
      },
    }),
    {
      width: WIDTH,
      height: HEIGHT,
      embedFont: true,
      fonts: await loadGoogleFonts(
        post.data.title + post.data.author + SITE.title + "by"
      ),
    }
  );
};
