/* data-cards.js — concept flashcards, remapped to Phase 1 chapter ids by tools/ one-off migration.
 * Ids are explicit and stable (never recomputed from array position) so saved/seen progress
 * (flashcards.prog, bookmarks.cards) keeps working across this remap.
 * Entry: [id, subject, question, answer, chapterId?] */
(function (S) {
  'use strict';
  const C = [
    ["c:0", "phy", "State Newton’s second law.", "Net force equals the rate of change of momentum: F = dp/dt (F = ma for constant mass).", "phy-11-04"],
    ["c:1", "phy", "What is the escape velocity of Earth?", "About 11.2 km/s. vₑ = √(2gR).", "phy-11-05"],
    ["c:2", "phy", "Isothermal vs adiabatic process?", "Isothermal: T constant, heat is exchanged, PV = constant. Adiabatic: Q = 0, PVᵞ = constant.", "phy-12-04"],
    ["c:3", "phy", "State Kirchhoff’s laws.", "Junction law: sum of currents at a node is zero. Loop law: sum of potential changes around a closed loop is zero.", "phy-12-09"],
    ["c:4", "phy", "State Lenz’s law.", "The induced emf opposes the change in flux that causes it. This is conservation of energy.", "phy-12-12"],
    ["c:5", "phy", "Condition for resonance in a series LCR circuit?", "X_L = X_C, so ω = 1/√(LC). Impedance is minimum (= R) and current is maximum.", "phy-12-13"],
    ["c:6", "phy", "What is the threshold frequency?", "The minimum frequency ν₀ = φ/h below which no photoelectrons are emitted, however bright the light.", "phy-12-14"],
    ["c:7", "phy", "Conditions for total internal reflection?", "Light goes from a denser to a rarer medium, and the angle of incidence is greater than the critical angle.", "phy-11-08"],
    ["c:8", "phy", "State Gauss’s law.", "Net electric flux through a closed surface equals q_enclosed / ε₀.", "phy-12-08"],
    ["c:9", "phy", "Why is the electric field zero inside a conductor?", "Free charges move until the net field is zero. So the whole conductor is at one potential.", "phy-12-08"],
    ["c:10", "phy", "SI unit of magnetic flux?", "Weber (Wb) = T m².", "phy-12-12"],
    ["c:11", "phy", "n-type vs p-type semiconductor?", "n-type: donor impurity (group 15, e.g. P), electrons are majority carriers. p-type: acceptor impurity (group 13, e.g. B), holes are majority carriers.", "phy-12-16"],
    ["c:12", "phy", "What does a coherent source mean in YDSE?", "Two sources with a constant phase difference. Only then do stable interference fringes form.", "phy-12-07"],
    ["c:13", "chem", "State Hund’s rule.", "Electrons fill degenerate orbitals singly, with parallel spins, before pairing.", "chem-11-02"],
    ["c:14", "chem", "State the Pauli exclusion principle.", "In one atom every electron has its own combination of n, l, m and s: two electrons never share all four quantum numbers.", "chem-11-02"],
    ["c:15", "chem", "State Le Chatelier’s principle.", "A system at equilibrium shifts to oppose any change in concentration, pressure or temperature.", "chem-12-03"],
    ["c:16", "chem", "State Markovnikov’s rule.", "When HX adds to an unsymmetrical alkene, hydrogen goes to the carbon that already has more hydrogens.", "chem-11-09"],
    ["c:17", "chem", "SN1 vs SN2 in one line each?", "SN1: two steps via a carbocation, 3° favoured, racemisation. SN2: one step, back-side attack, 1° favoured, inversion.", "chem-12-10"],
    ["c:18", "chem", "Order vs molecularity?", "Order is found by experiment and can be zero or fractional. Molecularity is theoretical, a whole number, and only for elementary steps.", "chem-12-06"],
    ["c:19", "chem", "State Raoult’s law.", "The partial vapour pressure of a component equals its mole fraction times the vapour pressure of the pure component.", "chem-12-02"],
    ["c:20", "chem", "Name the four colligative properties.", "Relative lowering of vapour pressure, boiling-point elevation, freezing-point depression and osmotic pressure.", "chem-12-02"],
    ["c:21", "chem", "Strong-field vs weak-field ligands?", "Strong field (CN⁻, CO) give a large Δ₀ and low-spin complexes. Weak field (I⁻, Br⁻) give a small Δ₀ and high-spin complexes.", "chem-12-09"],
    ["c:22", "chem", "Which aldehydes undergo the Cannizzaro reaction?", "Aldehydes with no α-hydrogen, e.g. HCHO and benzaldehyde, in concentrated alkali.", "chem-12-12"],
    ["c:23", "chem", "Test for primary amines?", "Carbylamine test: warm with CHCl₃ and KOH. A foul-smelling isocyanide forms.", "chem-12-13"],
    ["c:24", "chem", "What is lanthanoid contraction?", "A steady decrease in ionic size from La³⁺ to Lu³⁺ because 4f electrons shield the nuclear charge poorly.", "chem-12-08"],
    ["c:25", "chem", "What does Δn mean in K_p = K_c(RT)^Δn?", "Moles of gaseous products minus moles of gaseous reactants.", "chem-12-03"],
    ["c:26", "mth", "Condition for continuity at x = a?", "Left-hand limit = right-hand limit = f(a).", "mth-11-10"],
    ["c:27", "mth", "What does f′(x) = 0 tell you?", "x is a stationary point. It may be a maximum, a minimum or a point of inflection.", "mth-12-09"],
    ["c:28", "mth", "Second derivative test?", "f″ < 0 at a stationary point gives a local maximum. f″ > 0 gives a local minimum.", "mth-12-09"],
    ["c:29", "mth", "What does ILATE stand for?", "Inverse trig, Logarithmic, Algebraic, Trigonometric, Exponential. It is the priority order for choosing u in integration by parts.", "mth-12-10"],
    ["c:30", "mth", "When does A⁻¹ exist?", "When |A| ≠ 0 (A is non-singular).", "mth-12-02"],
    ["c:31", "mth", "Conditions for a binomial distribution?", "Fixed number of trials, two outcomes each, independent trials, constant probability of success.", "mth-12-15"],
    ["c:32", "mth", "Direction cosines vs direction ratios?", "Direction cosines are cos α, cos β, cos γ with l² + m² + n² = 1. Direction ratios are any numbers proportional to them.", "mth-12-06"],
    ["c:33", "mth", "Roots of ax² + bx + c = 0?", "x = (−b ± √(b² − 4ac)) / 2a. Sum = −b/a, product = c/a.", "mth-11-06"],
    ["c:34", "mth", "When does AM = GM?", "For positive numbers, AM ≥ GM, with equality only when all the numbers are equal."],
    ["c:42", "cs", "TCP vs UDP?", "TCP is connection-oriented, reliable and ordered. UDP is connectionless and faster, with no delivery guarantee.", "cs-12-09"],
  ];
  S.CONCEPT_CARDS = C.map((c) => ({ id: c[0], subj: c[1], q: c[2], a: c[3], ch: c[4] || '' }));
})((window.SOS = window.SOS || {}));
