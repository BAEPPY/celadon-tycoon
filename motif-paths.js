// Shared ink paths for the illustration workbench. Coordinates are centered at 0.
export function motifPath(id) {
  if (["peony", "chrysanthemum", "plum", "wildflower"].includes(id)) {
    const n = id === "chrysanthemum" ? 16 : id === "peony" ? 10 : 5;
    let d = "";
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      d += `M0 0Q${Math.cos(a - 0.3) * 90} ${Math.sin(a - 0.3) * 90} ${Math.cos(a) * 90} ${Math.sin(a) * 90}Q${Math.cos(a + 0.3) * 90} ${Math.sin(a + 0.3) * 90} 0 0`;
    }
    return d + (id === "wildflower" ? "M0 20V110M0 65Q-60 10 -55 60L0 85" : "");
  }
  if (id === "bamboo")
    return "M-35 100V-100M35 100V-100M-47 -50H-23M-47 10H-23M-47 70H-23M23 -50H47M23 10H47M23 70H47M35 10Q90 -60 105 -30Q80 10 35 10M-35 60Q-100 -20 -100 15Q-85 55 -35 60";
  if (id === "willow")
    return "M-65 95Q-60 -50 10 -100M-15 -65Q110 -100 100 100M-15 -65Q90 -100 70 90M-15 -65Q70 -100 40 82M-15 -65Q50 -100 10 73";
  if (id === "grape") {
    let d = "M0 -65Q0 -110 65 -100";
    for (let r = 0; r < 4; r++)
      for (let j = 0; j < 4 - r; j++) {
        let x = (j - (3 - r) / 2) * 38,
          y = r * 37 - 45;
        d += `M${x + 18} ${y}a18 18 0 1 0 -36 0a18 18 0 1 0 36 0`;
      }
    return d;
  }
  if (id === "text")
    return "M-60 -75H60M-45 -45H45M-60 -15H60M0 -95V15M-70 35H70M-45 65H45M0 15V100M-55 85L-25 105";
  if (id === "cloud")
    return "M-80 22C-115 -10 -65 -65 -40 -35C-35 -100 55 -95 60 -35C110 -60 120 35 70 35L-75 35ZM-50 8Q0 -30 45 12";
  if (id === "lotus")
    return "M0 65Q-100 -15 -76 -25Q-50 40 0 65M0 65Q-65 -15 -38 -65Q-10 25 0 65M0 65Q-25 -30 0 -85Q25 -30 0 65M0 65Q65 -15 38 -65Q10 25 0 65M0 65Q100 -15 76 -25Q50 40 0 65";
  return "M-10 10Q-50 -85 -105 -50Q-65 20 -10 30Q45 20 100 -55Q40 -45 5 5M0 15C65 5 0 -70 55 -75L85 -65M-5 27L-35 85M8 25L-10 85";
}
// Closed hole silhouettes; stroked ink paths above remain detailed inlay motifs.
export function cutoutPath(id) {
  if (id === "cloud")
    return "M-80 22C-115 -10 -65 -65 -40 -35C-35 -100 55 -95 60 -35C110 -60 120 35 70 35L-75 35Z";
  if (id === "lotus")
    return "M0 80Q-110 15 -85 -35L-42 -5Q-50 -60 0 -95Q50 -60 42 -5L85 -35Q110 15 0 80Z";
  if (id === "crane")
    return "M-10 10Q-50 -85 -105 -50Q-65 20 -10 30L-35 85L-20 85L5 35L0 85L12 85L20 30Q45 20 100 -55Q40 -45 5 5C65 5 0 -70 55 -75L85 -65L58 -52C30 -45 55 22 -10 10Z";
  if (id === "bamboo")
    return "M-18 -100H18V-30L70 -60L28 5V100H-18V30L-65 -5L-18 3Z";
  if (id === "willow") return "M0 -100Q90 0 0 100Q-65 0 0 -100Z";
  if (id === "text") return "M-15 -95H15V-15H90V15H15V95H-15V15H-90V-15H-15Z";
  const n = id === "chrysanthemum" ? 12 : id === "peony" ? 9 : 5;
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2,
      r = i % 2 ? 45 : 95;
    d += (i ? "L" : "M") + Math.cos(a) * r + " " + Math.sin(a) * r;
  }
  return d + "Z";
}
