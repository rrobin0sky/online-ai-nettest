export interface InterfaceTopologyInfo {
  isTunnelActive: boolean;
  tunnelInterface: string | null;
  tunnelGateway: string | null;
  physicalInterface: string | null;
  physicalGateway: string | null;
  isPhysicalBypassActive: boolean;
}

/**
 * Checks whether an interface name corresponds to a virtual network tunnel or VPN interface
 */
export function isVirtualTunnelInterface(ifaceName: string | null | undefined): boolean {
  if (!ifaceName) return false;
  const name = ifaceName.toLowerCase().trim();
  return (
    name.startsWith('utun') ||
    name.startsWith('ppp') ||
    name.startsWith('ipsec') ||
    name.startsWith('wg') ||
    name.startsWith('tun') ||
    name.startsWith('tap')
  );
}

/**
 * Resolves tunnel vs physical interface state from telemetry report
 */
export function resolveInterfaceState(linkInfo: {
  interface_name?: string;
  gateway_ip?: string | null;
  is_tunnel_active?: boolean;
  tunnel_interface?: string | null;
  tunnel_gateway?: string | null;
  physical_interface?: string | null;
  physical_gateway?: string | null;
  is_physical_bypass_active?: boolean;
}): InterfaceTopologyInfo {
  const isTunnelActive =
    linkInfo.is_tunnel_active ??
    isVirtualTunnelInterface(linkInfo.interface_name);

  return {
    isTunnelActive,
    tunnelInterface: linkInfo.tunnel_interface || (isTunnelActive ? linkInfo.interface_name || 'utun4' : null),
    tunnelGateway: linkInfo.tunnel_gateway || null,
    physicalInterface: linkInfo.physical_interface || (isTunnelActive ? 'en0' : linkInfo.interface_name || 'en0'),
    physicalGateway: linkInfo.physical_gateway || linkInfo.gateway_ip || null,
    isPhysicalBypassActive: linkInfo.is_physical_bypass_active ?? isTunnelActive,
  };
}
