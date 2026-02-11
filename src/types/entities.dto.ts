import { ApiProperty } from '@nestjs/swagger';

/**
 * Partner - Organization or company using the IoT platform
 */
export class PartnerDto {
  @ApiProperty({ description: 'Unique partner identifier' })
  _id: string;

  @ApiProperty({ description: 'Partner name' })
  name: string;

  @ApiProperty({ description: 'Unique partner ID' })
  partnerId: string;

  @ApiProperty({ description: 'Partner email address' })
  email: string;

  @ApiProperty({ description: 'Phone number' })
  phone: string;

  @ApiProperty({ description: 'Business address', required: false })
  address?: string;

  @ApiProperty({ description: 'Tax number', required: false })
  taxNumber?: string;

  @ApiProperty({ description: 'Business sector', required: false })
  businessSector?: string;

  @ApiProperty({ description: 'Logo URL' })
  logo: string;

  @ApiProperty({ description: 'Maximum number of projects allowed' })
  limitProject: number;

  @ApiProperty({ description: 'Maximum number of products allowed' })
  limitProduct: number;

  @ApiProperty({ description: 'Owner user ID' })
  ownerId: string;
}

/**
 * Project - Workspace containing devices and configurations
 */
export class ProjectDto {
  @ApiProperty({ description: 'Unique project identifier' })
  _id: string;

  @ApiProperty({ description: 'Project name' })
  name: string;

  @ApiProperty({ description: 'Owner user ID' })
  ownerId: string;

  @ApiProperty({ description: 'Associated partner ID' })
  partnerId: string;

  @ApiProperty({ description: 'App SDK limit' })
  appsdkLimit: number;

  @ApiProperty({ description: 'Whether email verification is required' })
  needVerifyEmail: boolean;

  @ApiProperty({ description: 'List of authorized services', type: [Object] })
  authorizedServices: object[];
}

/**
 * Location - Physical location grouping devices
 */
export class LocationDto {
  @ApiProperty({ description: 'Unique location identifier' })
  _id: string;

  @ApiProperty({ description: 'Location label/name' })
  label: string;

  @ApiProperty({ description: 'Location description' })
  desc: string;

  @ApiProperty({ description: 'Owner user ID' })
  userId: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  extraInfo?: object;
}

/**
 * Group - Logical grouping of devices
 */
export class GroupDto {
  @ApiProperty({ description: 'Unique group identifier' })
  _id: string;

  @ApiProperty({ description: 'Group label/name' })
  label: string;

  @ApiProperty({ description: 'Group description' })
  desc: string;

  @ApiProperty({ description: 'Owner user ID' })
  userId: string;

  @ApiProperty({ description: 'Associated location ID' })
  locationId: string;

  @ApiProperty({ description: 'Group type: 0 = Group, 1 = Tag' })
  type: number;

  @ApiProperty({ description: 'Element ID' })
  elementId: number;

  @ApiProperty({ description: 'Additional metadata', required: false })
  extraInfo?: object;
}

/**
 * Device - IoT device (sensor, actuator, etc.)
 */
export class DeviceDto {
  @ApiProperty({ description: 'Unique device identifier' })
  _id: string;

  @ApiProperty({ description: 'Device MAC address or UUID' })
  mac: string;

  @ApiProperty({ description: 'Device label/name' })
  label: string;

  @ApiProperty({ description: 'Device description' })
  desc: string;

  @ApiProperty({ description: 'Product ID' })
  productId: string;

  @ApiProperty({ description: 'Owner user ID' })
  userId: string;

  @ApiProperty({ description: 'Associated location ID' })
  locationId: string;

  @ApiProperty({ description: 'Associated partner ID' })
  partnerId: string;

  @ApiProperty({ description: 'Group ID (optional)', required: false })
  groupId?: string;

  @ApiProperty({ description: 'Virtual group ID (optional)', required: false })
  vgroupId?: string;

  @ApiProperty({ description: 'Network address' })
  nwkAddr: string;

  @ApiProperty({ description: 'Root UUID (optional)', required: false })
  rootUuid?: string;

  @ApiProperty({ description: 'Protocol control code' })
  protocolCtl: number;

  @ApiProperty({ description: 'Device features', type: [Number] })
  features: number[];

  @ApiProperty({ description: 'Firmware code' })
  firmCode: number;

  @ApiProperty({ description: 'Firmware version' })
  firmVer: string;

  @ApiProperty({ description: 'Source address' })
  srcAddr: number;

  @ApiProperty({ description: 'Element IDs', type: [Number] })
  elementIds: number[];

  @ApiProperty({ description: 'Favorite flag' })
  fav: boolean;

  @ApiProperty({ description: 'Product information array', type: [Number] })
  productInfos: number[];

  @ApiProperty({ description: 'Element information' })
  elementInfos: object;

  @ApiProperty({ description: 'Device classification: 0 = real, 10 = IR' })
  cdev: number;

  @ApiProperty({ description: 'Endpoint identifier' })
  endpoint: string;

  @ApiProperty({ description: 'Endpoint ID' })
  eid: number;

  @ApiProperty({ description: 'Link status (optional)', required: false })
  link?: number;

  @ApiProperty({ description: 'Link ID (optional)', required: false })
  linkId?: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  extraInfo?: object;
}

/**
 * Device State - Current state of a device
 */
export class DeviceStateDto {
  @ApiProperty({ description: 'Device ID' })
  deviceId: string;

  @ApiProperty({ description: 'Current state data' })
  state: object;

  @ApiProperty({ description: 'Last updated timestamp' })
  updatedAt: string;

  @ApiProperty({ description: 'Connection status' })
  online: boolean;
}
