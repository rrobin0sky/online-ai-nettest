use std::process::Command;
use std::time::Instant;
use regex::Regex;

use crate::models::{DnsBenchmarkResult, DnsStatus, ProxyTopologyInfo, ResolverCategory};

pub struct Stage2DnsProbe;

impl Stage2DnsProbe {
    pub async fn run_proxy_probe() -> Result<ProxyTopologyInfo, String> {
        tokio::task::spawn_blocking(Self::collect_proxy_info)
            .await
            .map_err(|e| format!("Proxy probe failed: {}", e))
    }

    pub async fn run_dns_benchmark(target_domain: &str) -> Result<Vec<DnsBenchmarkResult>, String> {
        let domain = target_domain.to_string();
        tokio::task::spawn_blocking(move || Self::benchmark_resolvers(&domain))
            .await
            .map_err(|e| format!("DNS benchmark failed: {}", e))
    }

    /// Query scutil --proxy for active HTTP/HTTPS/SOCKS proxies and bypass list
    pub fn collect_proxy_info() -> ProxyTopologyInfo {
        let mut info = ProxyTopologyInfo {
            proxy_enabled: false,
            http_proxy: None,
            https_proxy: None,
            socks_proxy: None,
            pac_url: None,
            bypass_list: Vec::new(),
        };

        let output = Command::new("scutil").arg("--proxy").output();
        let Ok(out) = output else {
            return info;
        };

        let text = String::from_utf8_lossy(&out.stdout);

        let http_enabled = text.contains("HTTPEnable : 1");
        let https_enabled = text.contains("HTTPSEnable : 1");
        let socks_enabled = text.contains("SOCKSEnable : 1");
        let pac_enabled = text.contains("ProxyAutoConfigEnable : 1");

        info.proxy_enabled = http_enabled || https_enabled || socks_enabled || pac_enabled;

        let extract_val = |key: &str| -> Option<String> {
            let re = Regex::new(&format!(r"{}\s*:\s*([^\s\n\r]+)", key)).ok()?;
            re.captures(&text).map(|cap| cap[1].to_string())
        };

        if http_enabled {
            if let (Some(h), Some(p)) = (extract_val("HTTPProxy"), extract_val("HTTPPort")) {
                info.http_proxy = Some(format!("{}:{}", h, p));
            }
        }

        if https_enabled {
            if let (Some(h), Some(p)) = (extract_val("HTTPSProxy"), extract_val("HTTPSPort")) {
                info.https_proxy = Some(format!("{}:{}", h, p));
            }
        }

        if socks_enabled {
            if let (Some(h), Some(p)) = (extract_val("SOCKSProxy"), extract_val("SOCKSPort")) {
                info.socks_proxy = Some(format!("{}:{}", h, p));
            }
        }

        if pac_enabled {
            info.pac_url = extract_val("ProxyAutoConfigURLString");
        }

        // Parse exceptions / bypass list
        let mut in_exceptions = false;
        for line in text.lines() {
            let line = line.trim();
            if line.contains("ExceptionsList : <array>") {
                in_exceptions = true;
                continue;
            }
            if in_exceptions {
                if line.starts_with('}') {
                    break;
                }
                if let Some(pos) = line.find(':') {
                    let val = line[pos + 1..].trim();
                    if !val.is_empty() {
                        info.bypass_list.push(val.to_string());
                    }
                }
            }
        }

        info
    }

    /// Query scutil --dns to discover local enterprise / DHCP configured DNS resolver
    pub fn get_system_nameservers() -> Vec<String> {
        let mut servers = Vec::new();
        let output = Command::new("scutil").arg("--dns").output();
        let Ok(out) = output else {
            return vec!["114.114.114.114".to_string()];
        };

        let text = String::from_utf8_lossy(&out.stdout);
        let re = Regex::new(r"nameserver\[\d+\]\s*:\s*([0-9.]+)").ok();

        if let Some(re) = re {
            for cap in re.captures_iter(&text) {
                let ip = cap[1].to_string();
                if !servers.contains(&ip) {
                    servers.push(ip);
                }
            }
        }

        if servers.is_empty() {
            servers.push("114.114.114.114".to_string());
        }

        servers
    }

    /// Run parallel DNS queries against configured target group
    pub fn benchmark_resolvers(domain: &str) -> Vec<DnsBenchmarkResult> {
        let system_dns = Self::get_system_nameservers();
        let primary_sys_dns = system_dns.first().cloned().unwrap_or_else(|| "114.114.114.114".to_string());

        let target_resolvers = vec![
            (
                "System Local DNS (DHCP)",
                primary_sys_dns.clone(),
                ResolverCategory::SystemLocal,
                true,
            ),
            (
                "AliDNS (Alibaba Cloud)",
                "223.5.5.5".to_string(),
                ResolverCategory::ChinaPublic,
                false,
            ),
            (
                "DNSPod (Tencent Cloud)",
                "119.29.29.29".to_string(),
                ResolverCategory::ChinaPublic,
                false,
            ),
            (
                "Cloudflare Public DNS",
                "1.1.1.1".to_string(),
                ResolverCategory::GlobalPublic,
                false,
            ),
            (
                "Google Public DNS",
                "8.8.8.8".to_string(),
                ResolverCategory::GlobalPublic,
                false,
            ),
        ];

        let mut results = Vec::new();

        for (name, ip, cat, is_default) in target_resolvers {
            let res = Self::query_single_resolver(name, &ip, cat, is_default, domain);
            results.push(res);
        }

        // Detect Geo / Split-horizon mismatch:
        // If system local resolved IP set doesn't overlap with any public DNS result
        let mut baseline_ips: Vec<String> = Vec::new();
        for r in &results {
            if !r.is_system_default && r.status == DnsStatus::Success {
                for ip in &r.resolved_ips {
                    if !baseline_ips.contains(ip) {
                        baseline_ips.push(ip.clone());
                    }
                }
            }
        }

        for r in results.iter_mut() {
            if r.is_system_default && r.status == DnsStatus::Success && !baseline_ips.is_empty() {
                let has_overlap = r.resolved_ips.iter().any(|ip| baseline_ips.contains(ip));
                if !has_overlap {
                    r.geo_mismatch = true;
                }
            }
        }

        results
    }

    fn query_single_resolver(
        name: &str,
        server_ip: &str,
        category: ResolverCategory,
        is_default: bool,
        domain: &str,
    ) -> DnsBenchmarkResult {
        // Use native `dig` command if available for exact upstream timing, fallback to UDP query
        let start = Instant::now();
        let dig_output = Command::new("dig")
            .args([
                &format!("@{}", server_ip),
                domain,
                "+time=2",
                "+tries=1",
                "+stats",
                "A",
            ])
            .output();

        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

        match dig_output {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                let (resolved_ips, query_time) = Self::parse_dig_output(&text);
                let final_latency = query_time.unwrap_or(elapsed_ms);

                if resolved_ips.is_empty() {
                    DnsBenchmarkResult {
                        resolver_name: name.to_string(),
                        resolver_ip: server_ip.to_string(),
                        resolver_category: category,
                        target_domain: domain.to_string(),
                        resolved_ips: Vec::new(),
                        latency_ms: Some(final_latency),
                        status: DnsStatus::Error,
                        is_system_default: is_default,
                        geo_mismatch: false,
                        error_message: Some("No A records returned (NXDOMAIN or empty)".to_string()),
                    }
                } else {
                    DnsBenchmarkResult {
                        resolver_name: name.to_string(),
                        resolver_ip: server_ip.to_string(),
                        resolver_category: category,
                        target_domain: domain.to_string(),
                        resolved_ips,
                        latency_ms: Some((final_latency * 10.0).round() / 10.0),
                        status: DnsStatus::Success,
                        is_system_default: is_default,
                        geo_mismatch: false,
                        error_message: None,
                    }
                }
            }
            _ => {
                // Timeout or unresolvable
                DnsBenchmarkResult {
                    resolver_name: name.to_string(),
                    resolver_ip: server_ip.to_string(),
                    resolver_category: category,
                    target_domain: domain.to_string(),
                    resolved_ips: Vec::new(),
                    latency_ms: None,
                    status: DnsStatus::Timeout,
                    is_system_default: is_default,
                    geo_mismatch: false,
                    error_message: Some(format!("Query timeout to resolver {}", server_ip)),
                }
            }
        }
    }

    fn parse_dig_output(text: &str) -> (Vec<String>, Option<f64>) {
        let mut ips = Vec::new();
        let mut query_time = None;

        let ip_re = Regex::new(r"IN\s+A\s+([0-9.]+)").ok();
        let time_re = Regex::new(r"Query time:\s*([0-9.]+)\s*msec").ok();

        if let Some(re) = ip_re {
            for cap in re.captures_iter(text) {
                let ip = cap[1].to_string();
                if !ips.contains(&ip) {
                    ips.push(ip);
                }
            }
        }

        if let Some(re) = time_re {
            if let Some(cap) = re.captures(text) {
                query_time = cap[1].parse::<f64>().ok();
            }
        }

        (ips, query_time)
    }
}
