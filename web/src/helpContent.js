// What the Help dialog says. Plain, and as hedged as the rest of the lab (rule 2): what was measured, what is simulated, what is UNVERIFIED.
export const HELP_SECTIONS = [
  {
    heading: "What this lab is",
    body: [
      "A one-page map of the demo family: one row for the Personal Agent demo, one for the Digital Worker agent, and one row per Ping product (PingOne, PingFederate, PingGateway, PingOne Privilege, PingOne Authorize, PingOne Protect). Each row shows the standalone apps that belong there as cards, plus links to the AI-DEMO2 pages to open next to them.",
      "It is the standalone twin of AI-DEMO2's \"Demo Map\" page. It is a map, not a launcher with special powers: the Open links just take you to each app."
    ]
  },
  {
    heading: "Measured, simulated, UNVERIFIED",
    body: [
      "Mock: a made-up sample shelf (invented apps on .example hosts). Nothing is read from your demo shelf and nothing is fetched from the network. The AI-DEMO2 page links point at a placeholder address.",
      "Real: the apps on your local demo shelf, read live and read-only from this machine. The running/not-running chips come from the shelf itself — that part is measured. Whether an app is good for a given demo is a judgment, not a measurement.",
      "The AI-DEMO2 page links are curated by hand and UNVERIFIED against the live AI-DEMO2 build; check them before you demo."
    ]
  },
  {
    heading: "How to use the page",
    body: [
      "Type in the Filter box (\"App name or description\") to narrow the cards. Use Expand all / Collapse all next to it to open or close every row; rows are open by default. The stamp line under the toolbar says how many apps are placed, how many are running and where the shelf data came from.",
      "Each card shows the app name, a Demo / Tester / Tool kind chip, a short description, an Open link, and a Running / Not running / Needs setup chip in Real mode.",
      "The mode picker in the top menu switches Mock / Real; the reset button puts the lab back to its launch mode. Talk track (top menu) toggles an inline section above the rows."
    ]
  },
  {
    heading: "If the map is empty or wrong",
    body: "In Real, everything comes from the shelf at SHELF_URL, read once per page load. If the shelf does not answer, the page says so and shows nothing — it never shows Mock data as Real. Switch to Mock to keep working, fix the shelf, then reload."
  }
];
