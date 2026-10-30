// Records the card's own motion as dabing.gif and dabing.mp4: the whole cake on the scale, all seven
// layers lifting apart, a pause on the open picture, closing again, and round. live.js draws every
// frame exactly as it does in the page; the recorder only swaps requestAnimationFrame for a clock it
// steps itself, so each frame is the same slice of time however long the screenshot in between takes.
//
//   CHROME_PATH=/path/to/chromium node tools/record.mjs [--fps 25] [--scale 1.25] [--no-mp4] [--keep]
//
// Chrome is driven through the anatomy skill's drive.mjs; the encoding needs ffmpeg.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRIVE = resolve(HERE, "../../.claude/skills/anatomy/scripts/drive.mjs");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : Number(args[at + 1]);
};
const FPS = option("fps", 25);
const SCALE = option("scale", 1.25);
const MP4 = !args.includes("--no-mp4");
// Each resting picture is held this long after its last pixel stops changing; the needle's final
// sub-pixel wobble runs on a little past what the eye can see, so on screen both stills last a bit longer.
const HOLD_CLOSED = 1.2; // the whole cake, where the loop starts and ends
const HOLD_OPEN = 3; // all seven apart, long enough to read the quotes
const WINDOW = option("window", 7); // seconds shot after each hover change; opening rests after about 4.5, closing 5.3

const STEP = 1000 / FPS;
const SUBSTEPS = Math.ceil(STEP / (1000 / 60)); // page ticks per frame, at 60 Hz or a little faster
const COUNT = Math.round((WINDOW * 1000) / STEP);

// Before the page's own scripts: frames come only from window.__advance, which returns how many
// frame callbacks are still waiting (0 once everything has come to rest). The hint is hidden,
// since nobody can hover a GIF; visibility keeps the layout as it is.
const PRELOAD = `(() => {
  let queue = [];
  let id = 0;
  let now = 1000;
  window.requestAnimationFrame = (callback) => (queue.push({ id: ++id, callback }), id);
  window.cancelAnimationFrame = (handle) => (queue = queue.filter((entry) => entry.id !== handle));
  window.__advance = (ms, substeps) => {
    for (let index = 0; index < substeps; index++) {
      now += ms / substeps;
      const due = queue;
      queue = [];
      for (const entry of due) entry.callback(now);
    }
    return queue.length;
  };
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = '.iso-plate-corner[data-corner="hint"]{visibility:hidden}';
    document.head.append(style);
  });
})();`;

const work = mkdtempSync(join(tmpdir(), "dabing-record-"));
const frameOf = (index) => join(work, `f${String(index).padStart(4, "0")}.png`);
const advance = ["eval", `__advance(${STEP}, ${SUBSTEPS})`];
const actions = [["until", "document.fonts.ready.then(() => true)"], advance, ["shot", frameOf(0), ".iso-plate", 1]];
let shots = 1;
const windowOf = () => {
  const first = shots;
  for (let index = 0; index < COUNT; index++) actions.push(advance, ["shot", frameOf(shots++), ".iso-plate", 1]);
  return [first, shots];
};
actions.push(["move", ".iso-stage", 0.5, 0.5]);
const opening = windowOf();
actions.push(["move", "body", 0.01, 0.01]);
const closing = windowOf();
writeFileSync(join(work, "actions.json"), JSON.stringify(actions));
writeFileSync(join(work, "preload.js"), PRELOAD);

const drive = spawnSync(process.execPath, [DRIVE, join(HERE, "dabing.html"), "--actions", join(work, "actions.json"), "--preload", join(work, "preload.js"), "--scale", String(SCALE)], { encoding: "utf8", maxBuffer: 64 << 20 });
const said = `${drive.stdout}\n${drive.stderr}`;
if (drive.status !== 0) {
  console.error(said);
  process.exit(1);
}

// What the page said along the way: frame callbacks left after each step, and the readout per shot.
const waiting = [...said.matchAll(/^eval: (\d+)$/gm)].map((match) => Number(match[1]));
const readouts = [...said.matchAll(/^shot .* · readout "(.*)"$/gm)].map((match) => match[1]);
const errors = said.split("\n").filter((line) => /error|exception/i.test(line));
if (errors.length) console.warn(errors.join("\n"));
// waiting[0] is the step before the first shot; waiting[i] the one before shot i
for (const [name, [first, end]] of [["opening", opening], ["closing", closing]]) {
  if (waiting[end - 1] !== 0) throw new Error(`the ${name} had not come to rest after ${WINDOW} s; raise WINDOW`);
  console.log(`${name}: at rest after ${((waiting.slice(first, end).indexOf(0) + 1) / FPS).toFixed(2)} s · ${readouts[end - 1]}`);
}

// Runs of identical frames become one frame held as long as the run. The two resting pictures get
// their holds; the last picture is the first one again, so it is dropped and the loop closes on it.
const hashOf = (index) => createHash("sha1").update(readFileSync(frameOf(index))).digest("hex");
const runs = [];
for (let index = 0; index < shots; index++) {
  const hash = hashOf(index);
  const run = runs[runs.length - 1];
  if (run && run.hash === hash) run.count++;
  else runs.push({ index, hash, count: 1 });
}
const restOf = (end) => runs.findLast((run) => run.index < end);
restOf(opening[1]).seconds = HOLD_OPEN;
const last = runs.pop();
if (last.hash !== runs[0].hash) throw new Error("the figure did not come back to the picture it started from");
runs[0].seconds = HOLD_CLOSED;
for (const run of runs) run.seconds ??= run.count / FPS;

// concat only honours a duration with a file after it, so the list ends on the first picture again;
// each picture opens at 100 frames a second so the timestamps land on whole GIF centiseconds
const entryOf = (index) => [`file '${frameOf(index)}'`, "option framerate 100"];
const list = ["ffconcat version 1.0", ...runs.flatMap((run) => [...entryOf(run.index), `duration ${run.seconds.toFixed(3)}`]), ...entryOf(0)];
writeFileSync(join(work, "frames.txt"), `${list.join("\n")}\n`);
const ffmpeg = (...rest) => {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(work, "frames.txt"), ...rest], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
};

// One palette for the whole loop, no dithering: the drawing is flat tones, which one shared palette
// holds closely, and the frames then differ only where something moved.
const gif = join(HERE, "dabing.gif");
ffmpeg("-filter_complex", "[0:v]split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle", "-fps_mode", "vfr", "-loop", "0", gif);
const outputs = [gif];
if (MP4) {
  const mp4 = join(HERE, "dabing.mp4");
  ffmpeg("-vf", `fps=${FPS},crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", "16", "-movflags", "+faststart", mp4);
  outputs.push(mp4);
}
const seconds = runs.reduce((total, run) => total + run.seconds, 0);
console.log(`${shots} shots, ${runs.length} distinct frames, ${seconds.toFixed(2)} s a loop`);
for (const out of outputs) console.log(`${out} · ${(statSync(out).size / 1048576).toFixed(2)} MB`);
if (args.includes("--keep")) console.log(`frames kept in ${work}`);
else rmSync(work, { recursive: true, force: true });
