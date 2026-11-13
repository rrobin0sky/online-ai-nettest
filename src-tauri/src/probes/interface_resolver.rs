use std::process::Command;
use regex::Regex;

#[derive(Debug, Clone, Default)]
pub struct InterfaceTopology {
    pub is_tunnel_active: bool,
    pub tunnel_interface: Option<String>,
    pub tunnel_gateway: Option<String>,
    pub physical_interface: Option<String>,
    pub physical_gateway: Option<String>,
    pub physical_ip: Option<String>,
    pub physical_port_type: Option<String>,
    pub is_physical_bypass_active: bool,
}

pub struct InterfaceResolver;

impl InterfaceResolver {
    /// Resolves active virtual tunnel interfaces (utun/ppp/ipsec) and discovers
    /// the underlying active physical hardware interface (en0/enX) and true router IP.
    pub fn resolve_topology(bypass_tunnel: bool) -> InterfaceTopology {
        let mut topo = InterfaceTopology::default();

        // 1. Identify Physical Hardware Interfaces via networksetup
        let physical_ports = Self::get_physical_hardware_ports();

        // 2. Discover active physical interface and its router
        for (port_type, device) in &physical_ports {
            if let Some(ip) = Self::get_device_ip(device) {
                topo.physical_interface = Some(device.clone());
                topo.physical_port_type = Some(port_type.clone());
                topo.physical_ip = Some(ip);

                // Query DHCP router option directly on this physical interface
                if let Some(router) = Self::get_device_router(device) {
                    topo.physical_gateway = Some(router);
                }
                break; // Found primary active physical interface
            }
        }

        // Fallback for physical gateway from netstat if ipconfig router wasn't set
        if topo.physical_gateway.is_none() {
            if let Some(phys_iface) = &topo.physical_interface {
                topo.physical_gateway = Self::get_gateway_for_interface_from_netstat(phys_iface);
            }
        }

        // 3. Detect Virtual Tunnel / VPN (utun / ppp / ipsec)
        // Check route get default and route get 8.8.8.8
        let default_route = Self::get_route_for_target("default");
        let internet_route = Self::get_route_for_target("8.8.8.8");

        let mut tunnel_detected = false;
        let mut tunnel_iface = None;
        let mut tunnel_gw = None;

        if let Some((iface, gw)) = default_route {
            if Self::is_virtual_interface(&iface) {
                tunnel_detected = true;
                tunnel_iface = Some(iface);
                tunnel_gw = Some(gw);
            }
        }

        if let Some((iface, gw)) = internet_route {
            if Self::is_virtual_interface(&iface) {
                tunnel_detected = true;
                tunnel_iface = Some(iface);
                tunnel_gw = Some(gw);
            }
        }

        // Also check netstat for split-tunnel routes (0/1, 128.0/1, etc.)
        if !tunnel_detected {
            if let Some((iface, gw)) = Self::detect_split_tunnel_from_netstat() {
                tunnel_detected = true;
                tunnel_iface = Some(iface);
                tunnel_gw = Some(gw);
            }
        }

        topo.is_tunnel_active = tunnel_detected;
        topo.tunnel_interface = tunnel_iface;
        topo.tunnel_gateway = tunnel_gw;

        // 4. Determine if physical bypass is active
        topo.is_physical_bypass_active =
            bypass_tunnel && topo.is_tunnel_active && topo.physical_interface.is_some() && topo.physical_gateway.is_some();

        topo
    }

    /// Check if interface name is a virtual tunnel (utun, ppp, ipsec, wg, tap, tun)
    pub fn is_virtual_interface(iface: &str) -> bool {
        let name = iface.to_lowercase();
        name.starts_with("utun")
            || name.starts_with("ppp")
            || name.starts_with("ipsec")
            || name.starts_with("wg")
            || name.starts_with("tun")
            || name.starts_with("tap")
    }

    /// Query networksetup -listallhardwareports to identify true physical interfaces
    fn get_physical_hardware_ports() -> Vec<(String, String)> {
        let mut ports = Vec::new();
        let output = Command::new("networksetup")
            .arg("-listallhardwareports")
            .output();

        let Ok(out) = output else {
            return ports;
        };

        let text = String::from_utf8_lossy(&out.stdout);
        let mut current_port: Option<String> = None;

        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("Hardware Port:") {
                current_port = Some(line.replace("Hardware Port:", "").trim().to_string());
            } else if line.starts_with("Device:") {
                let dev = line.replace("Device:", "").trim().to_string();
                if let Some(port) = current_port.take() {
                    // Filter out non-physical virtual bridges if needed, but keep Wi-Fi, Ethernet, Thunderbolt
                    if !dev.is_empty() && !dev.starts_with("bridge") {
                        ports.push((port, dev));
                    }
                }
            }
        }

        ports
    }

    /// Query ipconfig getifaddr <device>
    fn get_device_ip(device: &str) -> Option<String> {
        let output = Command::new("ipconfig")
            .args(["getifaddr", device])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !ip.is_empty() && ip.contains('.') {
            Some(ip)
        } else {
            None
        }
    }

    /// Query ipconfig getoption <device> router
    fn get_device_router(device: &str) -> Option<String> {
        let output = Command::new("ipconfig")
            .args(["getoption", device, "router"])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let router = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !router.is_empty() && router.contains('.') {
            Some(router)
        } else {
            None
        }
    }

    /// Query route -n get <target>
    fn get_route_for_target(target: &str) -> Option<(String, String)> {
        let output = Command::new("route")
            .args(["-n", "get", target])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let text = String::from_utf8_lossy(&output.stdout);
        let mut gateway = None;
        let mut interface = None;

        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("gateway:") {
                gateway = line.split_whitespace().nth(1).map(|s| s.to_string());
            } else if line.starts_with("interface:") {
                interface = line.split_whitespace().nth(1).map(|s| s.to_string());
            }
        }

        match (interface, gateway) {
            (Some(i), Some(g)) => Some((i, g)),
            (Some(i), None) => Some((i, "DirectLink".to_string())),
            _ => None,
        }
    }

    /// Check netstat -rn -f inet for split-tunnel routes assigned to utun*
    fn detect_split_tunnel_from_netstat() -> Option<(String, String)> {
        let output = Command::new("netstat")
            .args(["-rn", "-f", "inet"])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.len() >= 4 {
                let dest = tokens[0];
                let gw = tokens[1];
                let is_split_route = dest == "0/1"
                    || dest == "128.0/1"
                    || dest.starts_with("1/")
                    || dest.starts_with("2/")
                    || dest.starts_with("4/")
                    || dest.starts_with("8/")
                    || dest.starts_with("16/")
                    || dest.starts_with("32/")
                    || dest.starts_with("64/");

                if is_split_route {
                    for token in &tokens[2..] {
                        if Self::is_virtual_interface(token) {
                            return Some((token.to_string(), gw.to_string()));
                        }
                    }
                }
            }
        }

        None
    }

    /// Find gateway for physical interface from netstat table
    fn get_gateway_for_interface_from_netstat(target_iface: &str) -> Option<String> {
        let output = Command::new("netstat")
            .args(["-rn", "-f", "inet"])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let text = String::from_utf8_lossy(&output.stdout);
        let ip_re = Regex::new(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$").ok()?;

        for line in text.lines() {
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.len() >= 4 && tokens[0] == "default" {
                if tokens.contains(&target_iface) {
                    let gw = tokens[1];
                    if ip_re.is_match(gw) {
                        return Some(gw.to_string());
                    }
                }
            }
        }

        None
    }
}
