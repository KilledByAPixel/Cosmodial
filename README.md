# Skyscope

**The real sky, right now, in your browser — and the few things actually worth looking at tonight.**

Tell Skyscope where you are and it draws the live sky as if you were looking through a telescope. Drag to aim, scroll to zoom from a wide naked-eye view down to a 1° eyepiece, and let the **Up now** guide point you at the good stuff. Free, no account, no ads, no backend.

> **Live demo:** _deploy to GitHub Pages — see [Deployment](#deployment)._

---

## What makes it different

- **It has taste.** Instead of dumping a catalog on you, the **Up now** guide names the handful of sights worth your time tonight — easiest first, each with a *why it's cool* and a one-tap **Find**.
- **It feels like a telescope.** Zoom from the whole sky down to a 1° field and watch a faint dot resolve into a planet. **Find** smoothly *swings* the view to your target so you learn where it actually is.
- **It's honest.** Every object tells you what you'll *really* see through your own eyes — not the long-exposure fantasy photo.
- **It just works.** One web page, same on phone or laptop. No install, no sign-up, no network calls once it's loaded.

---

## By the numbers

| | |
|---|---|
| ⭐ **15,598 stars** | colored by their true tint, sized by brightness |
| 🏷️ **366 named stars** | from Sirius on down |
| ✏️ **22 constellations** | line figures + labels, and an editor to redraw them |
| 🪐 **Sun + Moon + 5 planets** | computed live, not stored |
| 🎯 **~1 arcminute** | positional accuracy |
| 🌙 **0 backends** | the sky is just math + a local star file |

---

## Things you can do

- **Look around.** Drag to aim, scroll or pinch to zoom. A reticle shows where you're pointed.
- **Find tonight's best.** The **Up now** guide ranks what's actually visible — bright, high, and worth it — and flies you to any of it.
- **Tap anything** for a plain-language card: what it is, where & when, how to spot it, and for stars, *the light you're seeing left it in [year]*.
- **Search** for any star, planet, or constellation by name.
- **Travel through time.** Jump to Sunset, Midnight, Sunrise, scrub through the night, or hit play and watch the sky wheel overhead.
- **Set your spot** with one-tap location, a city search, or manual lat/long — it's remembered next time.
- **Go dark.** A red-light night mode keeps your eyes adjusted out in the field.
- **Toggle** constellations, labels, an alt-az grid, or the full sphere (even below your horizon).

---

## How it works

The whole app is one idea: **`sky = f(location, time)`**. Every star has a fixed position; the Sun, Moon, and planets are computed each frame. Feed a position plus your location and the clock into the math and you get back *where to point* — altitude and azimuth. Change the time and the entire sky re-derives. Nothing to fetch, accurate for centuries.

---

## Run it

No build step — just serve the folder over http (ES modules don't work from `file://`):

```sh
npx serve .
```

Or open `index.html` with the VS Code **Live Server** extension. Run the tests with `node --test`.

### Deployment

Every path is relative, so it runs from a server root *or* a subpath unchanged. Push to GitHub and enable **Pages** on the default branch — done.

---

## Credits

Built with the MIT-licensed [Astronomy Engine](https://github.com/cosinekitty/astronomy). Stars from the [HYG Database](https://github.com/astronexus/HYG-Database) (CC-BY-SA 4.0); constellation lines from [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3-Clause). Full details in [ATTRIBUTION.md](ATTRIBUTION.md).

App code is **MIT** — see [LICENSE](LICENSE).
