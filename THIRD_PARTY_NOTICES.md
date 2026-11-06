# Third-party data

Device country estimates use the bundled DB-IP Lite snapshot supplied by
[`@ip-location-db/dbip-country-mmdb`](https://github.com/sapics/ip-location-db).
IP lookup happens locally; device IP addresses are not submitted to a geolocation service.

IP geolocation by [DB-IP](https://db-ip.com/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The bundled snapshot is dated June 2026. Estimates can be inaccurate, especially for VPNs.
Hosts can set `GEOIP_DATABASE` to a newer compatible country or city MMDB file.
The dataset package contains data only; current distributions have moved to the
provider's GitHub releases. See the upstream repository for database updates and attribution.
