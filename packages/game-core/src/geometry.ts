import type { Vector2 } from '@village-survivor/protocol';

export function distanceSquared(first: Vector2, second: Vector2): number {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return deltaX * deltaX + deltaY * deltaY;
}

export function distance(first: Vector2, second: Vector2): number {
  return Math.sqrt(distanceSquared(first, second));
}

export function normalized(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= Number.EPSILON) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

export function moveTowards(current: Vector2, target: Vector2, maximumDistance: number): Vector2 {
  const delta = { x: target.x - current.x, y: target.y - current.y };
  const remaining = Math.hypot(delta.x, delta.y);
  if (remaining <= maximumDistance || remaining <= Number.EPSILON) {
    return { ...target };
  }
  return {
    x: current.x + (delta.x / remaining) * maximumDistance,
    y: current.y + (delta.y / remaining) * maximumDistance,
  };
}

export function clampPosition(position: Vector2, width: number, height: number): Vector2 {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    x: Math.max(-halfWidth, Math.min(halfWidth, position.x)),
    y: Math.max(-halfHeight, Math.min(halfHeight, position.y)),
  };
}

export function distanceToSegment(point: Vector2, start: Vector2, end: Vector2): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared <= Number.EPSILON) {
    return distance(point, start);
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared,
    ),
  );
  return distance(point, {
    x: start.x + projection * segmentX,
    y: start.y + projection * segmentY,
  });
}
