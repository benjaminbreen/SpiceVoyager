export type AutoWalkTarget = {
  x: number;
  z: number;
};

const target: AutoWalkTarget = { x: 0, z: 0 };
let active = false;

export function setAutoWalkTarget(x: number, z: number) {
  target.x = x;
  target.z = z;
  active = true;
}

export function clearAutoWalkTarget() {
  active = false;
}

export function getAutoWalkTarget() {
  return active ? target : null;
}
