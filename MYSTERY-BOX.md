# Mystery Box art and motion

The box is a three-dimensional prop in the existing Daily Undead page. The real puzzle panel remains the application; no separate game UI or puzzle renderer was created. The chest has separate wooden boards, recessed joints, bevelled steel bands and trim, bolts, carrying handles, a clasp and a hinged lid. Three painted question marks remain on the front. No lettering is on the prop.

The original wide CSS crate had inconsistent perspective, flat surfaces and a large, bordered white light layer. The replacement uses one coherent camera, physically based materials, contact shadows and reflected light. The cool fill/rim lights relate it to the site's existing cyan/violet palette; white light originates inside the hollow chest. The final UI uses the existing font, surfaces, colours, clues and controls.

## Research and decisions

- [Nielsen Norman Group: The Role of Animation and Motion in UX](https://www.nngroup.com/articles/animation-purpose-ux/) argues for brief, purposeful and unobtrusive motion. The sequence communicates loading → opening → usable daily puzzle. It does not add introductory copy, a modal, a button to continue or looping effects.
- [NN/G: Duration and Motion Characteristics](https://www.nngroup.com/articles/animation-duration/) supports natural acceleration/deceleration and short interface transitions. The deliberately longer 1.5-second closed hold is the user's preference; the lid then has an 850ms weighted opening and the UI settles with a short, restrained lift/fade.
- [Three.js physically based material documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html) explains roughness/metalness and image-based lighting. Those material differences, bevels and reflected light supply depth instead of painting glow over a flat rectangle.
- [The official Zombies overview](https://news.blizzard.com/en-us/article/24121368/black-ops-6-zombies-what-you-need-to-know) describes the Mystery Box's random glowing reward. Here the daily puzzle replaces the weapon; puzzle selection and scoring are unchanged.
- [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) informed resolution limits, resource cleanup and avoiding a perpetual render loop.

## Assets and reproducibility

- `assets/mystery-box/aged-oak.webp`: original ImageGen material texture, converted to WebP. Built-in image generation was used, not the API/CLI fallback.
- `assets/mystery-box/chest-poster.webp`: transparent still rendered from the same 3D scene, camera and materials. This appears in the initial HTML, before JavaScript or puzzle data is ready. Its fit matches the live scene on desktop and phone.
- `js/mystery-box-scene.js`: prop, materials, camera and lighting.
- `js/mystery-box.js`: integration with the real panel and automatic lifecycle.
- `scripts/vendor/mystery-box-three.mjs`: explicit Three.js exports. Rebuild the checked-in browser bundle with `pnpm run build:mystery-box-vendor`. Three.js is locked in `pnpm-lock.yaml`; its MIT licence accompanies the bundle.

Texture generation prompt, verbatim:

> Use case: stylized-concept. Asset type: seamless albedo material texture for a realistic 3D wooden ammunition chest in a dark premium Zombies-themed website. Generate ONE square seamless/tileable surface texture, flat orthographic straight-on scan, of dark aged walnut/oak wood with beautiful long HORIZONTAL grain, subtle knots, fine hairline wear and natural tonal variation. Rich dark smoked brown, restrained neutral-warm undertones, believable material detail, premium AAA game prop texture quality, readable at small sizes. Single continuous wooden surface, NO planks seams or gaps, NO metal, NO objects, NO lighting gradients, NO directional shadows, NO border, NO text, NO question marks, NO glow, NO vignette. Even flat diffuse illumination for use as a color and subtle bump map on 3D geometry. The image must be a texture filling the entire square edge-to-edge.

## Responsive behaviour and fallback

The orthographic fit protects the fully open lid as well as the closed case. Phone framing is larger relative to the available width. Short viewports fit the prop to both dimensions. Pixel ratio is capped (1.5 on phones, 1.75 elsewhere), shadow resolution is limited, and frames render only during the brief opening and when the stage resizes. There is no always-running animation loop.

WebGL is progressively loaded alongside normal app initialization. If unavailable, if initialization exceeds its 1800ms deadline, or if the graphics context is lost, the presentation is cancelled and the ordinary puzzle appears directly, with no poster animation, closed hold or panel transition. A renderer that arrives after the deadline cannot restart the presentation. The matching still is only a loading placeholder while 3D initializes. Reduced motion also goes directly to the real puzzle after data loading. Hidden puzzle controls are inert; letter shortcuts ignore that period, preventing invisible guesses. The panel becomes interactive as it emerges. Focus is preserved, and resources are cleaned up on page exit.

Local QA can freeze the real component with `?boxReview=closed` or `?boxReview=open`. Closed review has a Render poster control to preview/export the current canvas image for replacing the still after geometry changes. `?boxReview=fallback` exercises the direct-to-puzzle path without loading the 3D renderer. These parameters are ignored outside localhost/127.0.0.1. They do not simulate puzzle data or account writes. Screenshots from frozen poses should be described as visual review, not as normal-play timing tests.
