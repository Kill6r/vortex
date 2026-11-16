# CPU sensors in VORTEX

`collect.ps1` is a persistent, CPU-only Windows PowerShell 5.1 collector using the unmodified LibreHardwareMonitorLib 0.9.6 library. It publishes one JSON frame per second and closes when its parent process exits.

The application first checks normal access. **Conectar CPU** starts the separate collector through Windows UAC. Samples are exchanged through a per-session temporary JSON file with atomic replacement. The main app sends a stop marker when closing. The main app remains unelevated.

The collector defaults to read-only. Only the application connection passes `-EnableTuning`. In that mode, a separate request/reply channel accepts only validated `apply` and session-scoped `undo` actions, with expiration and a fingerprint of the expected current configuration. No arbitrary firmware commands or executable code are accepted. No saved profile is applied at launch.

ZenStates-Core 1.91 reads SMU telemetry and performs supported PBO/Curve Optimizer writes without Ryzen Master. Direct tuning is restricted to the validated Ryzen 5 9600X Granite Ridge family/model and table version 0x620105. The 1828-byte mapped prefix may be in a 1828- or 2452-byte firmware buffer. Enabled physical cores are discovered from the disable mask; logical core numbers must not be sent blindly to SMU. Each write is read back and compared, with attempted rollback on failure and an explicit error if restoration cannot be verified. A session undo is available only while the current state still matches the last application.

Supported inputs: PPT 10–200 W, TDC 1–150 A, EDC 1–200 A with TDC <= EDC, scalar 1–10X, absolute FMax 4000–5800 MHz, and six integer CO offsets -30 to +10. These are input bounds, not a stability recommendation. FMax is read as an absolute value because the firmware's boost baseline is not inferred from advertised CPU frequency.

The known table supplies PPT/TDC live consumption, configured PPT/TDC/EDC limits, measured core/SoC voltage and FCLK. SoC power is calculated from measured SoC voltage × current. Instantaneous EDC current is not mapped and is never invented: the dashboard explicitly shows its configured limit instead. LHM supplies live temperature, package power and core clocks. Samples older than five seconds lose their live status and tuning authorization.

On a machine without PawnIO, **Activar sensores de hardware** launches the bundled, SHA-256-pinned and Authenticode-verified official 2.2.0 installer. Installation is an explicit user action. The unrestricted driver edition is never selected.

Native CPU clock sensors are preferred. When they are inaccessible, Windows Processor Information performance counters provide a dynamic clock estimate, clearly labelled in the dashboard. `os.cpus().speed`, base frequency and maximum advertised frequency are not used as live measurements.

Some CPUs do not expose every voltage, SoC value or PBO limit through this library. Those remain unavailable. VID values are never substituted for measured voltage. Frames older than five seconds are not displayed as live.

The helper and its libraries must be outside Electron's ASAR archive. `electron-builder.config.cjs` copies this directory to `resources/cpu-monitor`.
