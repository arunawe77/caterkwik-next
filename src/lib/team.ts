// Staff from https://www.caterkwik.co.uk/meettheteam.shtml. They front the "Recommended by" banners.
export const TEAM = [
  { name: "Melody", role: "Solutions Manager", photo: "/assets/img/team/melody-hd.jpg" },
  { name: "Mike", role: "Assistant Solutions Manager", photo: "/assets/img/team/mike-hd.jpg" },
  { name: "Courtney", role: "Solutions Coordinator", photo: "/assets/img/team/courtney-hd.jpg" },
  { name: "Kane", role: "Solutions Coordinator", photo: "/assets/img/team/kane-hd.jpg" },
] as const;

export const teamMember = (name: string) => TEAM.find((t) => t.name === name) ?? TEAM[0];
