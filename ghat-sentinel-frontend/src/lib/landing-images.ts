/** Photographs shown on the landing page. Add more by copying files into /public and listing them here. */
export interface LandingImage { src: string; alt: string; caption: string }
export const LANDING_IMAGES: LandingImage[] = [
  { src: "/visarjan-1.png", alt: "Durga idol being immersed at a ghat during visarjan", caption: "Immersion day at the water's edge" },
  { src: "/visarjan-2.png", alt: "Colourful Durga idol at the water's edge during immersion", caption: "Festival and river meet" },
  { src: "/visarjan-3.png", alt: "Post-visarjan debris and floral offerings in a water body", caption: "What is left in the water afterwards" },
  { src: "/visarjan-4.png", alt: "Idol remains and plastic waste at a ghat after Ganesh visarjan", caption: "The cleanup that follows" },
];
