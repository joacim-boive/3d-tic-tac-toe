export type OnboardingStepId =
  | "welcome"
  | "orbit"
  | "aim"
  | "place"
  | "depth"
  | "catch"
  | "use"
  | "ready";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  body: string;
};

export function onboardingSteps(touchUi: boolean): readonly OnboardingStep[] {
  if (touchUi) {
    return [
      {
        id: "welcome",
        title: "Quick tour",
        body: "Spin the cube, aim a cell, place your mark. Takes about a minute — skip anytime.",
      },
      {
        id: "orbit",
        title: "Spin the board",
        body: "Use two fingers to rotate. Pinch to zoom. One finger is for aiming.",
      },
      {
        id: "aim",
        title: "Aim a cell",
        body: "Drag with one finger to move the cursor on the current layer.",
      },
      {
        id: "place",
        title: "Place your mark",
        body: "Tap Place (or Drop) when the cursor sits on the cell you want. A quick tap only aims — it does not place.",
      },
      {
        id: "depth",
        title: "Change layers",
        body: "While aiming with one finger, add a second finger and drag up or down to move deeper or shallower.",
      },
      {
        id: "catch",
        title: "Catch power-ups",
        body: "In vs AI or Online, packages sometimes streak across the board. Tap a cylinder fast — only one is live.",
      },
      {
        id: "use",
        title: "Spend power-ups",
        body: "Extra places a bonus mark. Clear wipes a line. Tip tilts the cube so markers fall. Tap a chip when it is your turn.",
      },
      {
        id: "ready",
        title: "You’re set",
        body: "Pick a mode and start a match. Replay this tour anytime from the setup screen.",
      },
    ];
  }

  return [
    {
      id: "welcome",
      title: "Quick tour",
      body: "Spin the cube, aim a cell, place your mark. Takes about a minute — skip anytime.",
    },
    {
      id: "orbit",
      title: "Spin the board",
      body: "Two-finger scroll on a trackpad to orbit. Right-drag with a mouse. Pinch (or middle-scroll) to zoom.",
    },
    {
      id: "aim",
      title: "Aim a cell",
      body: "Left-drag to move the cursor on the current layer. A click without a drag aims only.",
    },
    {
      id: "place",
      title: "Place your mark",
      body: "Press Place (or Drop), or hit Space / Enter. Aiming and placing are separate on purpose.",
    },
    {
      id: "depth",
      title: "Change layers",
      body: "Shift + scroll, or press Q / [ for shallower and E / ] for deeper. WASD nudges the cursor on the layer.",
    },
    {
      id: "catch",
      title: "Catch power-ups",
      body: "In vs AI or Online, packages sometimes streak across the board. Click a cylinder fast — only one is live.",
    },
    {
      id: "use",
      title: "Spend power-ups",
      body: "Extra places a bonus mark. Clear wipes a line. Tip tilts the cube so markers fall. Click a chip on your turn.",
    },
    {
      id: "ready",
      title: "You’re set",
      body: "Pick a mode and start a match. Replay this tour anytime from the setup screen.",
    },
  ];
}
