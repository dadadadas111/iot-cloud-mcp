export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface ControlAttrs {
  power?: 'on' | 'off';
  brightness?: number;
  kelvin?: number;
  temperature?: number;
  mode?: 'AUTO' | 'COOL' | 'DRY' | 'HEAT' | 'FAN';
  color?: HsvColor;
}

const MODE_TO_RAW: Record<string, number> = {
  AUTO: 0,
  COOL: 1,
  DRY: 2,
  HEAT: 3,
  FAN: 4,
};

export function buildControlCommands(attrs: ControlAttrs): number[][] {
  const commands: number[][] = [];

  if (attrs.power !== undefined) {
    commands.push([1, attrs.power === 'on' ? 1 : 0]);
  }
  if (attrs.mode !== undefined) {
    commands.push([17, MODE_TO_RAW[attrs.mode]]);
  }
  if (attrs.temperature !== undefined) {
    commands.push([20, Math.round(attrs.temperature)]);
  }
  if (attrs.brightness !== undefined) {
    commands.push([28, Math.round(attrs.brightness * 10)]);
  }
  if (attrs.kelvin !== undefined) {
    commands.push([29, Math.round(attrs.kelvin)]);
  }
  if (attrs.color !== undefined) {
    commands.push([
      31,
      Math.round(attrs.color.h * 10),
      Math.round(attrs.color.s * 10),
      Math.round(attrs.color.v * 10),
    ]);
  }

  return commands;
}
