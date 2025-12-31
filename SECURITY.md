# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

Only the latest minor version receives security updates. We recommend always using the most recent release.

## Security Considerations

Auto Tagger is an Obsidian plugin that processes local markdown files. It does not:

- Transmit data outside your device
- Connect to external servers
- Store credentials or sensitive information
- Execute arbitrary code from note content

The plugin stores classifier training data locally within your Obsidian vault's plugin folder.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately rather than opening a public issue.

### How to Report

1. **Email**: Send details to the repository owner (check GitHub profile for contact)
2. **GitHub Security Advisory**: Use the "Security" tab → "Report a vulnerability" on the repository

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Resolution target**: Depends on severity, typically 2-4 weeks

### After Reporting

- You'll receive confirmation that your report was received
- We'll investigate and keep you informed of progress
- Once fixed, we'll credit you in the release notes (unless you prefer anonymity)
- Please allow time for a fix before public disclosure

## Known Security Measures

The plugin follows Obsidian's security guidelines:

- No use of `innerHTML` (prevents XSS)
- No inline styles or dynamic script injection
- Uses Obsidian's sandboxed API for file operations
- All processing happens locally within the vault

## Questions

For general security questions that aren't vulnerability reports, feel free to open a regular issue on GitHub.
