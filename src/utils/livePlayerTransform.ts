export type LiveVec3 = [number, number, number];

type ShipTransform = {
  pos: LiveVec3;
  rot: number;
  vel: number;
};

type WalkingTransform = {
  pos: LiveVec3;
  rot: number;
};

const liveShipTransform: ShipTransform = {
  pos: [0, 0, 0],
  rot: 0,
  vel: 0,
};

const liveWalkingTransform: WalkingTransform = {
  pos: [0, 5, 0],
  rot: 0,
};

function writeVec3(target: LiveVec3, source: readonly number[]) {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

export function syncLiveShipTransform(
  pos: readonly number[],
  rot: number,
  vel: number,
) {
  writeVec3(liveShipTransform.pos, pos);
  liveShipTransform.rot = rot;
  liveShipTransform.vel = vel;
}

export function syncLiveWalkingTransform(pos: readonly number[], rot: number) {
  writeVec3(liveWalkingTransform.pos, pos);
  liveWalkingTransform.rot = rot;
}

export function getLiveShipTransform() {
  return liveShipTransform;
}

export function getLiveWalkingTransform() {
  return liveWalkingTransform;
}
