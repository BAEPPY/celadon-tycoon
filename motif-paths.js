// Shared ornament geometry for the tray and the curved vessel. These simplified
// game ornaments are informed by the local museum photographs, not tracings.
// References: assets/models/README.md — 본관10075, 구10256, 덕수5382, 덕수19,
// 덕수6236, 덕수2182 and 덕수45. Ink and closed cutouts share their main contours.
// Coordinates are centred at 0 and fit the existing -125…125 preview viewBox.
const round = n => Math.round(n * 100) / 100;
const point = (x, y) => `${round(x)} ${round(y)}`;
const circle = (x, y, r) => `M${point(x + r, y)}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z`;

// Five rounded lobes, with a natural indentation between the plum petals.
function blossom(cx, cy, size) {
  const p = (a, r) => point(cx + Math.cos(a) * r * size, cy + Math.sin(a) * r * size);
  let d = '';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    if (!i) d = `M${p(a - Math.PI / 5, .53)}`;
    d += `C${p(a - .60, 1.16)} ${p(a + .60, 1.16)} ${p(a + Math.PI / 5, .53)}`;
  }
  return d + 'Z';
}

const peonyBloom = 'M-64 25C-89 20-98-2-80-19C-99-38-81-63-59-61C-67-86-33-101-16-80C-1-105 29-94 34-76C56-91 81-70 72-47C101-44 105-15 83-3C100 21 69 43 48 34C35 57 7 57-8 41C-29 59-56 48-64 25Z';
const peonyLeaves = 'M-8 55C-39 59-69 48-93 64C-77 65-81 77-68 81C-78 96-43 99-8 67ZM10 72C26 47 56 54 78 48C72 59 84 62 78 72C85 80 57 95 10 83Z';
const peonyStem = 'M-5 41C4 61 9 73 0 95C-5 109-25 108-29 95C-33 85-21 81-16 88';
const peony = peonyBloom + 'M-61-24C-60-51-33-64-16-46C-10-70 17-72 27-51C52-66 73-40 58-22M-61-7C-51 22-24 32-7 13C3 39 38 31 46 10M-37-18C-38-40-14-44-4-24C6-43 30-35 31-17C49-5 24 13 7-1C-9 16-32 9-37-18Z' + peonyStem + peonyLeaves;

// The chrysanthemum was not circled for replacement; retain its familiar stamp.
let chrysanthemum = '', chrysanthemumHole = '';
for (let i = 0; i < 16; i++) {
  const a = i * Math.PI * 2 / 16;
  chrysanthemum += `M0 0Q${Math.cos(a - .3) * 90} ${Math.sin(a - .3) * 90} ${Math.cos(a) * 90} ${Math.sin(a) * 90}Q${Math.cos(a + .3) * 90} ${Math.sin(a + .3) * 90} 0 0`;
}
for (let i = 0; i < 24; i++) {
  const a = i * Math.PI / 12 - Math.PI / 2, r = i % 2 ? 45 : 95;
  chrysanthemumHole += (i ? 'L' : 'M') + Math.cos(a) * r + ' ' + Math.sin(a) * r;
}
chrysanthemumHole += 'Z';

const plumBloom = blossom(-14, -31, 57);
const plumBranch = 'M-88 108L-37 72L-19 37L0 22M-37 72L18 62L48 36M18 62L37 89L74 103M48 36L66 8L94-1M66 8L60-17';
const plumBuds = 'M60-17C43-29 49-48 64-47C81-43 79-24 60-17ZM94-1C87-18 103-29 112-18C116-9 106 0 94-1Z';
const plumBranchHole = 'M-91 104L-41 69L-22 34L-3 19L3 25L-16 40L-33 75L-85 112ZM-39 68L15 58L44 33L62 5L92-5L96 3L70 12L52 39L21 66L-35 76ZM14 64L33 92L72 107L76 99L41 86L22 60ZM62 9L56-16L64-18L70 7Z';
const plum = plumBranch + plumBloom + circle(-14, -31, 7) + 'M-14-45V-52M0-36L7-39M-5-19L0-13M-23-19L-28-12M-28-36L-35-39' + plumBuds;

const bambooCanes = 'M-43 105Q-38 49-44-1Q-47-47-35-101M-24 104Q-19 49-27-3Q-32-49-18-97M23 105Q29 41 18-21Q14-59 24-94M40 105Q47 39 35-24Q31-63 41-92M-44 39L-23 38M-46-21L-29-23M-37-79L-20-76M26 45L44 44M18-22L36-25M20-74L37-72';
const bambooLeaves = 'M-38-20C-76-42-93-64-96-88C-67-77-44-57-38-20ZM-37-20C-66-21-95-10-108 10C-76 13-49-1-37-20ZM31 39C58 5 85-7 106-4C92 21 63 38 31 39ZM30 39C55 41 79 58 88 81C58 73 37 57 30 39ZM29-68C60-87 84-88 102-77C76-64 54-61 29-68Z';
const bamboo = bambooCanes + bambooLeaves;

const willowTrunk = 'M-42 108C-55 65-44 30-36 2C-30-23-34-51-47-76M-25 107C-39 62-27 30-17 4C-9-18-9-43-22-60M-36 2Q-5-53 38-70M-34-24Q-61-53-76-58';
const willowBoughs = 'M-38-50C-13-103 54-106 80-77M-26-61C13-97 79-74 79 79M-16-65C18-69 44-27 41 104M-49-47C-85-63-96-21-99 57';
const willowLeaves = 'M75-30Q98-30 97-5Q81-10 75-30ZM80 12Q103 16 100 41Q84 32 80 12ZM79 53Q99 61 90 85Q78 75 79 53ZM38 4Q58 7 61 28Q43 25 38 4ZM42 43Q63 48 61 70Q45 62 42 43ZM41 81Q62 87 55 108Q43 101 41 81ZM-89-17Q-107-15-110 7Q-94 5-89-17ZM-96 24Q-78 31-82 52Q-98 45-96 24Z';
const willowBoughHoles = 'M-40-53C-14-106 55-110 83-80L78-73C49-103-11-97-35-47ZM-28-64C17-102 84-76 83 79L75 80C76-72 12-92-24-58ZM-17-69C22-72 49-27 45 106L37 105C40-24 15-65-14-61ZM-49-51C-90-67-99-22-103 59L-95 60C-92-18-80-58-48-43Z';
const willow = willowTrunk + willowBoughs + willowLeaves;

const grapeLeaf = 'M-16-21L-38-37L-64-32L-60-55L-88-72L-62-80L-56-106L-31-92L-10-105L-8-78L16-66L-3-50Z';
const grapeBerries = [[-31,1,17],[7,0,18],[43,7,17],[-13,34,18],[25,40,18],[59,44,15],[7,73,17],[37,78,15],[22,105,12]].map(([x,y,r])=>circle(x,y,r)).join('');
const grape = grapeLeaf + 'M-16-21Q-29-54-54-74M-8-30C10-70 20-85 47-84C87-85 89-49 67-48C46-49 47-70 62-69M11-12L6-1' + grapeBerries;

const wildflowerBlooms = blossom(-30,-51,30) + blossom(58,-22,25) + blossom(-74,14,21);
const wildflowerLeaves = 'M-2 64C-21 27-53 28-64 40C-48 59-23 64-2 64ZM3 79C24 50 54 48 69 57C56 80 29 88 3 79ZM12 13C4-5-10-12-23-8C-23 11-5 18 12 13Z';
const wildflowerStemHole = 'M-11 107C8 71 13 28-8-8L-26-23L-18-28L0-12C21 27 16 74-3 112ZM7 51C40 35 54 18 54 1L62 1C62 23 48 43 10 59ZM2 78C-42 70-60 45-66 31L-74 35C-68 53-49 79 0 86Z';
const wildflower = 'M-7 109C12 72 17 26-4-10L-22-25M9 55C45 39 58 18 58 1M1 82C-47 74-64 47-70 33' + wildflowerBlooms + circle(-30,-51,4) + circle(58,-22,3.5) + circle(-74,14,3) + wildflowerLeaves;

// A coherent 文 for 글자(문자). The reference bottle carries a poem; we do not
// claim its inscription is 壽 or 福, or conflate writing with one specific wish.
const writing = 'M-12-101Q4-91 13-73M-92-44Q-2-39 94-49M-53-31C-38 23 9 73 94 105M58-33C47 25-12 80-94 108';
const writingHole = 'M-19-104Q6-97 24-75L9-64Q-2-88-22-92ZM-96-52Q2-45 99-58L96-42Q3-33-92-36ZM-59-35L-45-35C-24 25 23 70 101 97L89 111C13 80-40 33-59-35ZM52-36L66-30C51 33-5 86-91 114L-101 102C-13 71 35 23 52-36Z';

const craneBody = 'M-32 12C-15-5 5-7 22 2C39 2 51-5 48-21C46-33 32-38 34-55C35-71 46-83 59-81C70-80 75-70 70-61L110-59L71-52C56-50 48-42 55-31C72-8 64 8 50 19C39 30 19 32 9 26L-37 35L-24 22Z';
const craneUpperWing = 'M-17 6C-50-9-79-35-95-82L-65-65L-73-79Q-49-74-34-53L-39-68Q-15-57-5-35L-7-49Q16-34 19-10L16-1';
const craneLowerWing = 'M15 19C46 35 66 63 65 103L48 81L48 95L33 74L31 85L18 62C6 53-1 38 1 28';
const craneFeathers = 'M-75-63Q-53-28-23-10M-57-57Q-35-25-9-9M-37-48Q-19-22 5-8M24 38Q47 61 58 86M12 41Q24 67 41 76M57-70L59-70';
const craneLegs = 'M-10 29L-79 67L-103 68M2 30L-65 82L-91 93';
const crane = craneUpperWing + craneLowerWing + craneBody + craneFeathers + craneLegs;
const craneHole = 'M-10 11C-47-5-78-34-95-82L-65-65L-73-79Q-49-74-34-53L-39-68Q-15-57-5-35L-7-49Q16-34 19-10L19 2C39 2 51-5 48-21C46-33 32-38 34-55C35-71 46-83 59-81C70-80 75-70 70-61L110-59L71-52C56-50 48-42 55-31C72-8 64 8 50 19C39 30 31 32 25 29C50 45 67 70 65 103L48 81L48 95L33 74L31 85L18 62C6 53-1 38 1 28L-62 85L-92 99L-96 90L-68 77L-10 29L-75 71L-104 74L-106 64L-80 62L-26 28L-37 35L-24 22L-32 12Z';

// Layered horizontal cloud scrolls and an S-shaped vapour, from 덕수2182.
// The middle ribbon contains the origin, so a centre click visibly opens it.
const cloudMiddle = 'M-104 12C-85 11-84-3-68-3C-72-17-46-23-34-10C-21 1-9-7 6-10C29-14 36-21 54-12C66-5 65 3 79-3C95-12 108-2 102 9C97 20 85 12 77 20C62 33 43 23 27 25C5 28-2 35-19 24C-36 13-41 30-56 26C-69 24-64 14-78 19C-92 25-95 17-104 12Z';
const cloudUpper = 'M-69-39C-54-54-41-40-28-46C-16-52-15-68 3-62C18-55 23-51 39-54C56-60 68-52 66-43C64-35 51-36 43-33C22-26 15-41-4-34C-25-27-31-39-45-32C-58-26-63-35-69-39Z';
const cloudLower = 'M-50 61C-36 48-22 57-12 53C2 42 12 45 20 52C29 59 43 48 54 56C64 64 53 74 39 70C24 66 22 77 7 70C-8 62-14 72-28 70C-40 70-42 62-50 61Z';
const cloudTail = 'M-1-63C15-79-19-80-7-94C-1-102 13-96 10-88M8 73C-7 83 19 88 7 101C0 107-9 101-5 95';
const cloud = cloudUpper + cloudMiddle + cloudLower + cloudTail;

const lotusOuter = 'M0 82C-52 76-86 47-106-5C-70-10-40 10-26 35C-49 4-57-23-50-56C-26-46-11-24 0 4C11-24 26-46 50-56C57-23 49 4 26 35C40 10 70-10 106-5C86 47 52 76 0 82Z';
const lotusCenter = 'M0 67C-28 28-29-24 0-92C29-24 28 28 0 67Z';
const lotus = lotusOuter + lotusCenter + 'M-99 6C-57 28-45 61 0 82M99 6C57 28 45 61 0 82M-48-43C-34 9-22 33-10 48M48-43C34 9 22 33 10 48M-59 84Q0 113 59 84M0 94V110';

const MOTIFS = {
  peony: {ink: peony, hole: peonyBloom + peonyLeaves},
  chrysanthemum: {ink: chrysanthemum, hole: chrysanthemumHole},
  plum: {ink: plum, hole: plumBloom + plumBuds + plumBranchHole},
  bamboo: {ink: bamboo, hole: 'M-44 105L-24 105Q-20 42-29-19Q-33-65-18-97L-35-101Q-48-54-44-1Q-38 49-44 105ZM23 105H40Q48 41 35-24Q31-63 41-92L24-94Q14-59 18-21Q29 41 23 105Z' + bambooLeaves},
  willow: {ink: willow, hole: 'M-42 108C-55 65-44 30-36 2C-30-23-34-51-47-76L-22-60C-9-43-9-18-17 4C-27 30-39 62-25 107Z' + willowBoughHoles + willowLeaves},
  grape: {ink: grape, hole: grapeLeaf + grapeBerries},
  wildflower: {ink: wildflower, hole: wildflowerBlooms + wildflowerLeaves + wildflowerStemHole},
  text: {ink: writing, hole: writingHole},
  crane: {ink: crane, hole: craneHole},
  cloud: {ink: cloud, hole: cloudUpper + cloudMiddle + cloudLower},
  lotus: {ink: lotus, hole: lotusOuter + lotusCenter},
};

export function motifPath(id) { return (MOTIFS[id] || MOTIFS.crane).ink; }
export function cutoutPath(id) { return (MOTIFS[id] || MOTIFS.crane).hole; }
