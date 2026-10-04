# Positioning the Studio and its ecosystem

This is a strategic product note, not a claim that the project already delivers every capability described here.

## Keep the name; make the layers explicit

**Elementary Learning Studio** is a strong learner-facing name. “Studio” suggests agency, making, rehearsal, and a place where unfinished work is welcome. It feels warmer than “platform” or “framework,” especially to a family or teacher.

The ambiguity is real: the repository is not itself one learner's studio. It is the open framework, governance layer, and reference implementation used to produce studio experiences. That can be resolved with a simple brand architecture instead of a rename:

| Layer | Recommended language | What it means |
| --- | --- | --- |
| Project and community | Elementary Learning Studio | The public identity and shared mission |
| Repository and developer offering | the Studio framework | Code, activity contracts, privacy rules, tests, and generators |
| Learner-facing runtime | a studio | The private experience running on a learner's device |
| Educational extensions | activity packs or modules | Original or licensed curriculum resources |
| Integrator offering | a studio distribution | A configured deployment for a family, school, language, or curriculum |

A useful descriptor is: **“An open framework for learner-owned studios.”** A more concrete privacy-led line is: **“Learning experiences that run with the learner, not on the learner.”** The first is clearer for developers; the second is memorable for families and institutions.

## Market perception

The project's most defensible position is not “another worksheet app” and not “AI tutor.” It is dependable infrastructure for responsive learning experiences with unusually legible privacy and curriculum decisions.

Different audiences should encounter different proof:

- Families and learners: it works without an account, progress stays here, and the learner can see and export what is known about them.
- Teachers and schools: activities are inspectable, printable, deployable, and useful without a cloud learner profile.
- Curriculum authors: an activity can be reproduced, tested, translated, and credited instead of disappearing inside a proprietary interface.
- Developers and researchers: input, interpretation, action, evidence, and storage have explicit contracts that can be audited independently.
- Service providers: open foundations leave room for paid implementation, support, localization, accessibility work, hosting, device integration, training, and original content.

“Studio” should remain the human-facing noun. “Framework” should appear in the subtitle, repository description, architecture documents, and developer navigation. Calling the whole experience a framework would improve technical precision but weaken the invitation to learners.

## A healthy commercial and open ecosystem

Free software does not require every surrounding service to be free. The project can enlarge the domain while avoiding both surveillance business models and hostility to sustainable work.

Good complements include:

- paid installation, managed deployment, and support for schools;
- accessibility audits and adaptations;
- commissioned localization and culturally specific original activities;
- teacher development and curriculum integration;
- optional self-hosted administration that is separate from the learner runtime;
- hardware and offline distribution partnerships;
- commercial activity packs whose license and data behavior are clear.

The boundary should be principled: paid value comes from expertise, service, reliability, and original work—not from trapping learner records or making core exports unreadable. Implementations should remain interoperable, attribution should be visible, and learners or institutions should be able to leave with their materials and records.

The open repository is therefore a commons and a reference implementation, not a promise to replace every publisher, teacher, developer, or service company. It can establish trusted interfaces on which many organizations build.

## Feedback without quiet telemetry

Product feedback and learner-performance research are different data flows and must never be merged casually.

The default studio should make no background report. A future feedback pathway should be deliberately staged:

1. Keep events on the device by default.
2. Let the person inspect a plain-language preview of the exact payload.
3. Offer export to a local file before offering submission.
4. If submission is added, ask separately for the purpose, destination, and scope of each contribution.
5. Strip names and direct identifiers unless they are genuinely necessary and separately consented.
6. Keep qualitative product feedback separate from practice histories and learner profiles.
7. Publish retention, deletion, governance, and access rules before collecting anything.
8. Treat systematic learner research as research, with the appropriate institutional ethics, consent, and safeguarding process.

Aggregate or privacy-preserving statistics can reduce risk, but they are not a substitute for informed participation or honest governance. “Anonymous” should not be promised merely because a name field was removed.

## Adaptation without learner labels

The framework can respond to evidence without assigning a child a fixed type. It can offer text, speech, diagrams, manipulable objects, and printable work as complementary ways to encounter the same idea. Adaptation should be expressed as a transparent next-step suggestion—“this representation may help with this task”—rather than a permanent profile such as “visual learner” or “auditory learner.”

The strongest evidence of growth remains understandable to the learner: an artifact they can make, an explanation they can give, an action they can now complete, or a strategy they can choose with greater independence.

## Near-term positioning decisions

- Keep **Elementary Learning Studio**.
- Use **“An open framework for learner-owned studios”** beside the name in developer-facing places.
- Refer to the web experience as **a studio running on this device**.
- Call the repository **the Studio framework and reference implementation**.
- Lead public pages with concrete behavior, not generalized “AI” claims.
- Make local processing observable: microphone state, recognized text, interpretation, action, and storage behavior should be visible at the appropriate level.
- Preserve a non-AI path for every essential activity.
- Add any feedback channel only after its data contract can be stated and tested as precisely as the local voice contract.
