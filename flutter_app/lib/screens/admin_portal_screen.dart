import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../theme/trusttrace_theme.dart';
import '../core/skill_taxonomy.dart';
import '../widgets/common.dart';

class AdminPortalScreen extends StatefulWidget {
  final Map<String, dynamic> adminUser;
  final List<Map<String, dynamic>> students;
  final List<Map<String, dynamic>> credentials;
  final VoidCallback onRefresh;

  const AdminPortalScreen({
    super.key,
    required this.adminUser,
    required this.students,
    required this.credentials,
    required this.onRefresh,
  });

  @override
  State<AdminPortalScreen> createState() => _AdminPortalScreenState();
}

class _AdminPortalScreenState extends State<AdminPortalScreen> {
  final _lookupCtrl = TextEditingController();
  final _titleCtrl = TextEditingController();
  late final TextEditingController _orgCtrl;
  String _domain = '';
  bool _scopeToInstitution = true;

  @override
  void initState() {
    super.initState();
    _orgCtrl = TextEditingController(
      text: (widget.adminUser['university'] ?? 'University Registrar Office')
          .toString(),
    );
  }

  @override
  void dispose() {
    _lookupCtrl.dispose();
    _titleCtrl.dispose();
    _orgCtrl.dispose();
    super.dispose();
  }

  bool _matchesAdminInstitution(String? uniStr) {
    if (!_scopeToInstitution) return true;
    final adminUni =
        (widget.adminUser['university'] ?? 'University Registrar Office')
            .toString()
            .trim()
            .toLowerCase();
    final cand = (uniStr ?? '').trim().toLowerCase();
    if (cand.isEmpty) return true;
    if (adminUni.contains('registrar') &&
        (cand.contains('registrar') || cand.contains('university'))) {
      return true;
    }
    return cand.contains(adminUni) || adminUni.contains(cand);
  }

  // Skill areas follow the target student's field of study.
  List<String> get _issueAxes {
    final q = _lookupCtrl.text.trim().toLowerCase();
    final target = widget.students.where((s) =>
        '${s['email']}'.toLowerCase() == q || '${s['did']}'.toLowerCase() == q || '${s['studentId']}'.toLowerCase() == q);
    return SkillTaxonomy.forUser(target.isEmpty ? null : target.first).axisNames;
  }

  Future<void> _directIssue() async {
    if (_titleCtrl.text.trim().isEmpty || _lookupCtrl.text.trim().isEmpty) return;
    final axes = _issueAxes;
    final res = await ApiService.issueCredential({
      'studentLookup': _lookupCtrl.text.trim(),
      'achievementTitle': _titleCtrl.text.trim(),
      'issuingOrganization': _orgCtrl.text.trim(),
      'competencyDomain': axes.contains(_domain) ? _domain : axes.first,
      'validationMode': 'auto',
    });
    if (!mounted) return;
    if (res.ok) {
      _titleCtrl.clear();
      widget.onRefresh();
    }
    showToast(context, res.ok ? '${res.data['message']}' : res.error!, error: !res.ok);
  }

  @override
  Widget build(BuildContext context) {
    final adminInstitution =
        (widget.adminUser['university'] ?? 'University Registrar Office')
            .toString();

    final scopedCreds = widget.credentials.where((c) {
      return _matchesAdminInstitution(c['studentUniversity']?.toString()) ||
          _matchesAdminInstitution(c['issuingOrganization']?.toString());
    }).toList();

    final drafts = scopedCreds.where((c) => c['state'] == 'Draft').toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
      children: [
        // Admin Header Card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const BrandLogoBadge(size: 42, borderRadius: 10),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (widget.adminUser['name'] ?? 'Dr. Sam Rivera')
                                .toString(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${widget.adminUser['departmentRole'] ?? 'Office of the Registrar'} • $adminInstitution',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    ActionChip(
                      avatar: Icon(
                        _scopeToInstitution
                            ? Icons.filter_alt_outlined
                            : Icons.public,
                        size: 15,
                        color: TrustTraceTheme.linkedInBlue,
                      ),
                      label: Text(
                        _scopeToInstitution
                            ? 'Scoped: $adminInstitution'
                            : 'Showing All Institutions',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      onPressed: () => setState(
                        () => _scopeToInstitution = !_scopeToInstitution,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Pending Approval Queue
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.pending_actions_outlined,
                      size: 18,
                      color: TrustTraceTheme.linkedInBlue,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Pending Approval Queue (${drafts.length})',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const Divider(height: 18),
                if (drafts.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      'No certificates waiting in queue for your institution.',
                      style: TextStyle(fontSize: 12.5, color: Colors.grey),
                    ),
                  )
                else
                  ...drafts.map(
                    (d) => Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.grey.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (d['achievementTitle'] ?? '').toString(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${d['studentName'] ?? 'Student'} • ${d['competencyDomain'] ?? 'Leadership'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              FilledButton.icon(
                                style: FilledButton.styleFrom(
                                  backgroundColor:
                                      TrustTraceTheme.linkedInBlue,
                                  visualDensity: VisualDensity.compact,
                                ),
                                onPressed: () async {
                                  await ApiService.approveMint(
                                    d['id'].toString(),
                                  );
                                  widget.onRefresh();
                                },
                                icon: const Icon(Icons.verified, size: 15),
                                label: const Text(
                                  'Approve & Mint',
                                  style: TextStyle(fontSize: 12),
                                ),
                              ),
                              OutlinedButton(
                                style: OutlinedButton.styleFrom(
                                  visualDensity: VisualDensity.compact,
                                ),
                                onPressed: () async {
                                  await ApiService.deleteCredential(
                                    d['id'].toString(),
                                  );
                                  widget.onRefresh();
                                },
                                child: const Text(
                                  'Reject',
                                  style: TextStyle(fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Direct Admin Issuance
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Direct Admin Issuance',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _lookupCtrl,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Student Email or DID',
                    hintText: 'e.g., student@university.edu',
                    prefixIcon: Icon(Icons.person_search_outlined, size: 18),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Certificate Title',
                    hintText: 'e.g., Robotics & IoT Society President',
                    prefixIcon:
                        Icon(Icons.workspace_premium_outlined, size: 18),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _orgCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Issuing Institution / Department',
                    hintText: 'e.g., University Registrar Office',
                    prefixIcon: Icon(Icons.account_balance_outlined, size: 18),
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  key: ValueKey(_issueAxes.join('|')),
                  initialValue: _issueAxes.contains(_domain) ? _domain : _issueAxes.first,
                  isExpanded: true,
                  items: _issueAxes
                      .map((a) => DropdownMenuItem(value: a, child: Text(a, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setState(() => _domain = v ?? _domain),
                  decoration: const InputDecoration(
                    labelText: 'Skill area',
                    prefixIcon: Icon(Icons.category_outlined, size: 18),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 44,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: TrustTraceTheme.linkedInBlue,
                    ),
                    onPressed: _directIssue,
                    icon: const Icon(Icons.verified_outlined, size: 18),
                    label: const Text(
                      'Issue & Mint Soulbound Badge',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Issued Credentials List
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Issued Credentials (${scopedCreds.length})',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Divider(height: 18),
                if (scopedCreds.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      'No credentials issued for this institution yet.',
                      style: TextStyle(fontSize: 12.5, color: Colors.grey),
                    ),
                  )
                else
                  ...scopedCreds.map((c) {
                    final isRevoked = c['state'] == 'Revoked';
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.grey.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      (c['achievementTitle'] ?? '').toString(),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      '${c['studentName'] ?? 'Student'} • ${c['competencyDomain'] ?? 'Credential'}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: isRevoked
                                      ? TrustTraceTheme.dangerRed
                                          .withValues(alpha: 0.12)
                                      : TrustTraceTheme.successGreen
                                          .withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  (c['state'] ?? 'Locked').toString(),
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: isRevoked
                                        ? TrustTraceTheme.dangerRed
                                        : TrustTraceTheme.successGreen,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              if (!isRevoked)
                                OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(
                                    visualDensity: VisualDensity.compact,
                                    foregroundColor: Colors.amber[800],
                                  ),
                                  onPressed: () async {
                                    await ApiService.revokeCredential(
                                      c['id'].toString(),
                                    );
                                    widget.onRefresh();
                                  },
                                  icon: const Icon(Icons.block, size: 14),
                                  label: const Text(
                                    'Revoke',
                                    style: TextStyle(fontSize: 12),
                                  ),
                                ),
                              OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  visualDensity: VisualDensity.compact,
                                  foregroundColor: TrustTraceTheme.dangerRed,
                                ),
                                onPressed: () async {
                                  await ApiService.deleteCredential(
                                    c['id'].toString(),
                                  );
                                  widget.onRefresh();
                                },
                                icon: const Icon(
                                  Icons.delete_outline,
                                  size: 14,
                                ),
                                label: const Text(
                                  'Delete',
                                  style: TextStyle(fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
