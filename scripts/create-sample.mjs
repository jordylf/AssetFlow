import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
// This creates a NEW disposable project, and never touches an existing project.
const root = join(tmpdir(), `AssetFlow Studio ${Date.now()}`);
await mkdir(join(root, "moodboard"), { recursive: true });
await mkdir(join(root, "materials"), { recursive: true });
await mkdir(join(root, "04_Textures"), { recursive: true });
const svg = (color, shape) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="${color}"/>${shape}</svg>`;
await writeFile(
  join(root, "moodboard", "Architectural study.svg"),
  svg(
    "#a4b2a1",
    '<path d="M220 600V150l360-80v530" fill="#d9d4bf"/><path d="M580 70l140 80v450H580" fill="#646d5c"/><path d="M310 600V250l180-40v390" fill="#727d6b"/>',
  ),
);
await writeFile(
  join(root, "moodboard", "Form exploration.svg"),
  svg(
    "#cfc0ad",
    '<ellipse cx="450" cy="480" rx="210" ry="30" fill="#ac9982"/><circle cx="450" cy="290" r="165" fill="#e6dccd"/><circle cx="450" cy="290" r="85" fill="#b6a58d"/>',
  ),
);
await writeFile(
  join(root, "materials", "concrete_normal.svg"),
  svg("#8c84ce", '<path d="M0 180Q450 400 900 180V600H0" fill="#798dd7"/>'),
);
await writeFile(
  join(root, "04_Textures", "concrete_normal.svg"),
  svg("#8c84ce", '<circle cx="450" cy="300" r="200" fill="#929bd9"/>'),
);
await writeFile(
  join(root, "Studio scene.gltf"),
  JSON.stringify(
    {
      asset: { version: "2.0", generator: "AssetFlow sample" },
      scene: 0,
      scenes: [{ name: "Studio", nodes: [] }],
      nodes: [],
    },
    null,
    2,
  ),
);
await writeFile(
  join(root, "Creative brief.txt"),
  "STUDIO / 01\nA study in quiet forms.\n\nReferences, material studies, and a scene file.\nThis sample project is disposable.\n",
);
await writeFile(
  join(root, "Read me.md"),
  "# AssetFlow sample\n\nThis is a disposable project for trying the organizer.\n",
);
console.log(root);
