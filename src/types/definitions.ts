/**
 * Entity Definitions for IoT Cloud Platform
 *
 * This file provides comprehensive documentation of all core entities
 * in the IoT Cloud system, their relationships, and use cases.
 */

export const ENTITY_DEFINITIONS = {
  partner: {
    name: 'Partner',
    description:
      'A partner represents an organization or company using the IoT platform. Each partner has limits on projects and products they can create.',
    fields: {
      _id: 'Unique identifier for the partner',
      partnerId: 'Partner-specific unique ID',
      name: 'Display name of the partner organization',
      email: 'Contact email address',
      phone: 'Contact phone number',
      address: 'Physical business address',
      taxNumber: 'Tax identification number',
      businessSector: 'Industry or business sector',
      logo: 'URL to partner logo image',
      limitProject: 'Maximum number of projects this partner can create',
      limitProduct: 'Maximum number of products this partner can have',
      ownerId: 'User ID of the partner owner/admin',
    },
    relationships: {
      hasMany: ['projects', 'devices'],
      belongsTo: ['user (as owner)'],
    },
    commonUseCase:
      'Query partner details to understand organizational limits and contact information',
  },

  project: {
    name: 'Project',
    description:
      'A project is a workspace that contains devices, configurations, and settings. Each partner can have multiple projects to organize different deployments or customers.',
    fields: {
      _id: 'Unique identifier for the project',
      name: 'Display name of the project',
      ownerId: 'User ID who owns this project',
      partnerId: 'Associated partner ID',
      appsdkLimit: 'Maximum number of app SDK integrations allowed',
      needVerifyEmail: 'Whether email verification is required for users',
      authorizedServices: 'List of services/features enabled for this project',
    },
    relationships: {
      belongsTo: ['partner', 'user (as owner)'],
      hasMany: ['devices', 'locations', 'groups'],
    },
    commonUseCase:
      'List user projects to allow switching between different deployments or environments',
  },

  location: {
    name: 'Location',
    description:
      'A location represents a physical place where devices are installed (e.g., "Living Room", "Office Floor 2", "Warehouse A"). Locations help organize devices spatially.',
    fields: {
      _id: 'Unique identifier for the location',
      label: 'Display name (e.g., "Living Room", "Warehouse A")',
      desc: 'Detailed description of the location',
      userId: 'Owner user ID',
      extraInfo: 'Additional metadata (coordinates, floor plan, etc.)',
    },
    relationships: {
      hasMany: ['devices', 'groups'],
      belongsTo: ['user'],
    },
    commonUseCase: 'Group devices by physical location for easier management and automation rules',
  },

  group: {
    name: 'Group',
    description:
      'A group is a logical collection of devices that can be controlled together (e.g., "All Lights", "Security System"). Groups can be simple collections (type=0) or tags (type=1).',
    fields: {
      _id: 'Unique identifier for the group',
      label: 'Display name (e.g., "All Lights", "First Floor")',
      desc: 'Description of the group purpose',
      userId: 'Owner user ID',
      locationId: 'Associated location (groups are location-specific)',
      type: '0 = standard group, 1 = tag',
      elementId: 'Element type ID for this group',
      extraInfo: 'Additional metadata',
    },
    relationships: {
      hasMany: ['devices'],
      belongsTo: ['user', 'location'],
    },
    commonUseCase: 'Control multiple devices at once (e.g., turn off all lights in a group)',
  },

  device: {
    name: 'Device',
    description:
      'A device is a physical IoT device (sensor, actuator, controller) connected to the platform. Each device has a unique MAC address and belongs to a location and optionally a group.',
    fields: {
      _id: 'Unique identifier for the device',
      mac: 'Unique hardware MAC address or UUID',
      label: 'User-friendly name (e.g., "Bedroom Light", "Front Door Sensor")',
      desc: 'Detailed description',
      productId: 'Product/model identifier',
      userId: 'Owner user ID',
      locationId: 'Physical location where device is installed',
      groupId: 'Optional group membership',
      partnerId: 'Associated partner',
      features: 'Array of supported feature codes',
      firmCode: 'Firmware code version',
      firmVer: 'Firmware version string',
      elementIds: 'Array of element IDs (device capabilities)',
      elementInfos: 'Detailed element information',
      cdev: 'Device classification: 0=real device, 10=IR device',
      fav: 'Favorite flag for quick access',
      online: 'Connection status (in state)',
    },
    relationships: {
      belongsTo: ['user', 'partner', 'location', 'group', 'product'],
      hasOne: ['state'],
    },
    commonUseCase: 'Query devices to display status, control them, or show in dashboards',
  },

  state: {
    name: 'Device State',
    description:
      'The current real-time state of a device, including sensor readings, switch status, battery level, connection status, etc. State updates in real-time as device conditions change.',
    fields: {
      deviceId: 'Associated device ID',
      state: 'Current state object (varies by device type)',
      updatedAt: 'Last update timestamp',
      online: 'Whether device is currently connected',
    },
    relationships: {
      belongsTo: ['device'],
    },
    commonUseCase:
      'Check current device status (e.g., is light on/off, temperature reading, door open/closed)',
  },
};

export const COMMON_WORKFLOWS = [
  {
    name: 'Get User Overview',
    description: 'Retrieve all entities for a logged-in user',
    steps: [
      '1. GET /api/v1/locations - Get all user locations',
      '2. GET /api/v1/groups - Get all user groups',
      '3. GET /api/v1/devices - Get all user devices',
      '4. (Optional) For each device: GET /api/v1/devices/:id/state',
    ],
  },
  {
    name: 'Check Device Status',
    description: 'Get current state of a specific device',
    steps: [
      '1. GET /api/v1/devices - Find device by name/location',
      '2. GET /api/v1/devices/:id/state - Get current state',
    ],
  },
  {
    name: 'List Devices by Location',
    description: 'Show all devices in a specific location',
    steps: [
      '1. GET /api/v1/locations - Get locations',
      '2. GET /api/v1/devices?locationId=:id - Filter devices by location',
    ],
  },
];
