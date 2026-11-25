import 'package:flutter/material.dart';
import '../core/skill_taxonomy.dart';
import '../services/verification_service.dart';
import '../theme/trusttrace_theme.dart';
import 'common.dart';
import 'skill_graph.dart';
import 'skill_radar.dart';

class VerificationResultView extends StatelessWidget {
  final VerificationOutcome outcome;
  final List<Widget> actions;
  const VerificationResultView({super.key, required this.outcome, this.actions = const []});

  @override
  Widget build(BuildContext context) {
    final holder = outcome.holder;
    final field = SkillTaxonomy.forUser(holder);
    final creds = outcome.credentials;
    final validCreds = creds.where((c) => c['signatureValid'] == true).toList();
    final validCount = creds.where((c) => c['signatureValid'] == true && c['revoked'] != true).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Banner(
          outcome: outcome,
          validCount: validCount,
          total: creds.length,
          revoked: creds.where((c) => c['signatureValid'] == true && c['revoked'] == true).length,
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                UserAvatar(user: holder, size: 52),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text((holder['name'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(
                        [field.label, if ((holder['university'] ?? '').toString().isNotEmpty) holder['university']].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor),
                      ),
                      const SizedBox(height: 2),
                      Text((holder['did'] ?? '').toString(),
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontFamily: 'monospace', fontSize: 10.5, color: Theme.of(context).hintColor)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (actions.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Wrap(spacing: 8, runSpacing: 8, children: actions)),
        const SizedBox(height: 4),
        SectionCard(
          title: 'Credentials (${creds.length})',
          icon: Icons.workspace_premium_outlined,
          child: creds.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text('No public credentials shared yet.', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor)),
                )
              : Column(children: creds.map((c) => _CredentialRow(cred: c, field: field)).toList()),
        ),
        if (validCreds.isNotEmpty) ...[
          SectionCard(title: 'Skill network', icon: Icons.hub_outlined, child: SkillGraph(holder: holder, credentials: validCreds, field: field)),
          SectionCard(title: 'Skill radar', icon: Icons.radar, child: SkillRadar(credentials: validCreds, field: field)),
        ],
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  final VerificationOutcome outcome;
  final int validCount;
  final int total;
  final int revoked;
  const _Banner({required this.outcome, required this.validCount, required this.total, this.revoked = 0});

  @override
  Widget build(BuildContext context) {
    final offline = outcome.offline;
    final bad = outcome.anyInvalid;
    final caution = !bad && (revoked > 0 || total == 0);
    final color = offline || caution ? TrustTraceTheme.warningAmber : (bad ? TrustTraceTheme.dangerRed : TrustTraceTheme.successGreen);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(offline ? Icons.wifi_off_rounded : (bad || caution ? Icons.gpp_maybe_outlined : Icons.verified_user), color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  offline
                      ? 'Verified Offline (Live revocation status unavailable)'
                      : bad
                          ? 'Some credentials failed verification'
                          : total == 0
                              ? 'Identity confirmed — no public credentials yet'
                              : revoked > 0
                                  ? '$revoked credential${revoked == 1 ? ' has' : 's have'} been revoked'
                                  : 'Verified against the live registry',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: color),
                ),
                const SizedBox(height: 3),
                Text(
                  offline
                      ? 'Signatures were checked on this device with the registrar\'s cached public key. Reconnect to confirm none have been revoked.'
                      : total == 0
                          ? 'This candidate is registered but hasn\'t shared any minted credentials.'
                          : '$validCount of $total credential${total == 1 ? '' : 's'} valid — signatures checked on this device.',
                  style: const TextStyle(fontSize: 12, height: 1.35),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CredentialRow extends StatelessWidget {
  final Map<String, dynamic> cred;
  final FieldOfStudy field;
  const _CredentialRow({required this.cred, required this.field});

  @override
  Widget build(BuildContext context) {
    final axis = SkillTaxonomy.axisFor(cred, field);
    final color = SkillTaxonomy.colorFor(field, axis);
    final revoked = cred['revoked'] == true;
    final valid = cred['signatureValid'] == true;
    final date = DateTime.tryParse('${cred['issuanceDate']}');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(color: revoked || !valid ? TrustTraceTheme.dangerRed : color, borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.workspace_premium, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((cred['achievementTitle'] ?? '').toString(),
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, decoration: revoked ? TextDecoration.lineThrough : null)),
                const SizedBox(height: 2),
                Text(
                  [cred['issuingOrganization'], if (date != null) '${date.year}-${date.month.toString().padLeft(2, '0')}'].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor),
                ),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  Pill(axis, color: color, filled: true),
                  revoked
                      ? const Pill('Revoked', color: TrustTraceTheme.dangerRed, icon: Icons.block)
                      : valid
                          ? const Pill('Verified', color: TrustTraceTheme.successGreen, icon: Icons.check_circle_outline)
                          : const Pill('Invalid signature', color: TrustTraceTheme.dangerRed, icon: Icons.error_outline),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
