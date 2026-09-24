# Summation: an EMG primer

An interactive primer on nerve conduction studies and needle EMG, live at
[patrickglover.io/emg](https://patrickglover.io/emg/).

Every waveform is built from a simulated population of individual axons and
motor units, so the textbook numbers fall out of the model rather than being
drawn by hand. Colour always means an axon's conduction velocity.

1. **Summation**: a CMAP is ~200 motor unit potentials added together.
2. **Dispersion**: distance spreads the crowd; phase cancellation; why SNAPs are fragile.
3. **Lesions**: axon loss vs demyelination, the 75% line, uniform vs patchy, focal lesions.
5. **Junction**: repetitive stimulation, safety factor, MG vs LEMS.
6. **At rest**: spontaneous activity on needle EMG, with sound.

Chapters 4 (F-waves), 7 (recruitment) and 8 (cases) are planned.

Plain HTML, CSS and JavaScript with no build step. Open `index.html` through
any static server, e.g. `python3 -m http.server`.

`src/model.js` also runs under Node, which is handy for checking the model's
numbers against reference values.

Educational use only. Reference values are approximate; labs differ.
