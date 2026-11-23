import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../core/document_geometry.dart';
import '../core/portfolio_qr.dart';
import '../core/skill_taxonomy.dart';
import '../services/api_service.dart';
import '../theme/trusttrace_theme.dart';
import '../widgets/common.dart';
import '../widgets/skill_graph.dart';
import '../widgets/skill_radar.dart';

class StudentWalletScreen extends StatelessWidget {
  final Map<String, dynamic> student;
  final List<Map<String, dynamic>> credentials;
  final bool offline;
  final Future<void> Function() onRefresh;

  const StudentWalletScreen({super.key, required this.student, required this.credentials, required this.offline, required this.onRefresh});

  List<Map<String, dynamic>> get _mine => credentials.where((c) => c['studentUserId'] == student['id']).toList();

  Future<void> _mutate(BuildContext context, Future<ApiResult> Function() call) async {
    final res = await call();
    if (!context.mounted) return;
    if (res.ok) {
      if (res.data['message'] != null) showToast(context, res.data['message'].toString());
      await onRefresh();
    } else {
      showToast(context, res.error!, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final field = SkillTaxonomy.forUser(student);
    final mine = _mine;
    final verified = mine.where((c) => c['state'] == 'Locked').length;
    final visible = student['visibleInTalentSearch'] != false;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 32),
        children: [
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                height: 72,
                decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF004182), TrustTraceTheme.linkedInBlue, Color(0xFF1D4ED8)])),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Transform.translate(offset: const Offset(0, -34), child: UserAvatar(user: student, size: 76, ring: true)),
                  Transform.translate(
                    offset: const Offset(0, -24),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${student['name']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                      if ('${student['headline'] ?? ''}'.isNotEmpty)
                        Padding(padding: const EdgeInsets.only(top: 2), child: Text('${student['headline']}', style: const TextStyle(fontSize: 13.5))),
                      const SizedBox(height: 4),
                      Row(children: [
                        const Icon(Icons.school_outlined, size: 15, color: TrustTraceTheme.linkedInBlue),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            [field.label, if ('${student['university'] ?? ''}'.isNotEmpty) student['university']].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 10),
                      Wrap(spacing: 6, runSpacing: 6, children: [
                        if ('${student['studentId'] ?? ''}'.isNotEmpty) Pill('${student['studentId']}', color: TrustTraceTheme.linkedInBlue),
                        Pill('$verified verified', color: TrustTraceTheme.successGreen, icon: Icons.verified_outlined),
                        if (offline) const Pill('Offline', color: TrustTraceTheme.warningAmber, icon: Icons.cloud_off_outlined),
                      ]),
                    ]),
                  ),
                  Row(children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: offline ? () => showToast(context, ApiService.offlineMessage, error: true) : () => _showUploadSheet(context, field),
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44), shape: const StadiumBorder()),
                        icon: const Icon(Icons.add_circle_outline, size: 18),
                        label: const Text('Add certificate', overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _showQr(context, null),
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44), shape: const StadiumBorder()),
                        icon: const Icon(Icons.qr_code_2, size: 18),
                        label: const Text('Portfolio QR', overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 6),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    value: visible,
                    onChanged: offline ? null : (v) => _mutate(context, () => ApiService.toggleTalentVisibility('${student['id']}', v)),
                    title: const Text('Visible in recruiter search', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                    subtitle: const Text('Shared links and QR codes work either way', style: TextStyle(fontSize: 11.5)),
                  ),
                ]),
              ),
            ]),
          ),
          SectionCard(
            title: 'My credentials (${mine.length})',
            icon: Icons.workspace_premium_outlined,
            child: mine.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 22),
                    child: Text('No credentials yet. Tap "Add certificate" to verify your first one.',
                        textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor)),
                  )
                : Column(children: [
                    for (var i = 0; i < mine.length; i++) ...[
                      if (i > 0) const Divider(height: 1),
                      _CredentialTile(
                        cred: mine[i],
                        field: field,
                        offline: offline,
                        onQr: () => _showQr(context, mine[i]),
                        onTogglePrivacy: () => _mutate(context, () => ApiService.togglePrivacy('${mine[i]['id']}', mine[i]['isPublic'] == false)),
                        onDelete: () => _confirmDelete(context, mine[i]),
                      ),
                    ],
                  ]),
          ),
          SectionCard(title: 'Skill network', icon: Icons.hub_outlined, child: SkillGraph(holder: student, credentials: mine, field: field)),
          SectionCard(title: 'Skill radar', icon: Icons.radar, trailing: Pill(field.label, color: TrustTraceTheme.linkedInBlue), child: SkillRadar(credentials: mine, field: field)),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, Map<String, dynamic> cred) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete credential?'),
        content: Text('"${cred['achievementTitle']}" will be removed from your wallet and its token burned.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: TrustTraceTheme.dangerRed), onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok == true && context.mounted) await _mutate(context, () => ApiService.deleteCredential('${cred['id']}'));
  }

  void _showQr(BuildContext context, Map<String, dynamic>? cred) {
    // Built from cached data, so it works with no connection at all.
    final payload = buildPortfolioPayload(student, cred == null ? _mine : [cred]);
    final url = encodePortfolioUrl(payload, ApiService.webOrigin);
    final count = (payload['c'] as List).length;
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(cred == null ? 'Your portfolio' : '${cred['achievementTitle']}',
                textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
              child: QrImageView(data: url, size: 250, errorCorrectionLevel: QrErrorCorrectLevel.L, backgroundColor: Colors.white),
            ),
            const SizedBox(height: 14),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.wifi_off_rounded, size: 18, color: TrustTraceTheme.linkedInBlue),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  count > 0
                      ? 'Contains $count signed credential${count == 1 ? '' : 's'} a recruiter can verify offline.'
                      : 'No public, minted credentials yet — this QR links to your profile only.',
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  void _showUploadSheet(BuildContext context, FieldOfStudy field) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _UploadSheet(student: student, field: field, onDone: onRefresh),
    );
  }
}

class _CredentialTile extends StatelessWidget {
  final Map<String, dynamic> cred;
  final FieldOfStudy field;
  final bool offline;
  final VoidCallback onQr;
  final VoidCallback onTogglePrivacy;
  final VoidCallback onDelete;
  const _CredentialTile({required this.cred, required this.field, required this.offline, required this.onQr, required this.onTogglePrivacy, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final axis = SkillTaxonomy.axisFor(cred, field);
    final color = SkillTaxonomy.colorFor(field, axis);
    final state = '${cred['state']}';
    final isPublic = cred['isPublic'] != false;
    final date = DateTime.tryParse('${cred['issuanceDate']}');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: state == 'Revoked' ? TrustTraceTheme.dangerRed : color, borderRadius: BorderRadius.circular(11)),
            child: const Icon(Icons.workspace_premium, color: Colors.white, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${cred['achievementTitle']}',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, decoration: state == 'Revoked' ? TextDecoration.lineThrough : null)),
              const SizedBox(height: 2),
              Text([cred['issuingOrganization'], if (date != null) '${date.day}/${date.month}/${date.year}'].join(' · '),
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
              const SizedBox(height: 6),
              Wrap(spacing: 6, runSpacing: 6, children: [
                Pill(axis, color: color, filled: true),
                Pill(
                  state == 'Revoked' ? 'Revoked' : state == 'Draft' ? 'Pending review' : 'Verified',
                  color: state == 'Revoked' ? TrustTraceTheme.dangerRed : state == 'Draft' ? TrustTraceTheme.warningAmber : TrustTraceTheme.successGreen,
                ),
              ]),
            ]),
          ),
        ]),
        Padding(
          padding: const EdgeInsets.only(left: 44, top: 4),
          child: Wrap(spacing: 2, children: [
            TextButton.icon(onPressed: onQr, icon: const Icon(Icons.qr_code, size: 16), label: const Text('Share', style: TextStyle(fontSize: 12.5))),
            TextButton.icon(
              onPressed: offline ? null : onTogglePrivacy,
              icon: Icon(isPublic ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 16),
              label: Text(isPublic ? 'Public' : 'Private', style: const TextStyle(fontSize: 12.5)),
            ),
            IconButton(
              tooltip: 'Delete',
              onPressed: offline ? null : onDelete,
              icon: const Icon(Icons.delete_outline, size: 19, color: TrustTraceTheme.dangerRed),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _UploadSheet extends StatefulWidget {
  final Map<String, dynamic> student;
  final FieldOfStudy field;
  final Future<void> Function() onDone;
  const _UploadSheet({required this.student, required this.field, required this.onDone});

  @override
  State<_UploadSheet> createState() => _UploadSheetState();
}

class _UploadSheetState extends State<_UploadSheet> {
  String _stage = 'pick'; // pick | scanning | review
  String _fileName = '';
  Uint8List? _preview;
  Map<String, dynamic>? _scan;
  String? _error;
  bool _queue = false;
  bool _submitting = false;
  final _title = TextEditingController();
  final _org = TextEditingController();
  late String _axis = widget.field.axisNames.first;

  @override
  void dispose() {
    _title.dispose();
    _org.dispose();
    super.dispose();
  }

  Future<void> _pick(String source) async {
    final picked = switch (source) {
      'camera' => await ApiService.pickFromCamera(),
      'gallery' => await ApiService.pickFromGallery(),
      _ => await ApiService.pickFromFiles(),
    };
    if (picked == null) return;
    final mime = '${picked['mimeType'] ?? 'image/jpeg'}';
    final data = '${picked['base64Data'] ?? ''}';
    Uint8List? preview;
    try {
      final b64 = '${picked['previewBase64'] ?? ''}';
      preview = b64.isNotEmpty ? base64Decode(b64) : (mime.startsWith('image/') ? base64Decode(data.split(',').last) : null);
    } catch (_) {}

    setState(() {
      _stage = 'scanning';
      _fileName = '${picked['fileName'] ?? 'certificate'}';
      _preview = preview;
      _error = null;
    });

    final geometry = mime.startsWith('image/') && preview != null ? await analyzeImageBytes(preview) : null;
    final res = await ApiService.verifyUpload(fileName: _fileName, base64Data: data, mimeType: mime, geometry: geometry);
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _stage = 'pick';
        _error = res.error;
      });
      return;
    }
    final extracted = Map<String, dynamic>.from(res.data['extracted'] ?? {});
    setState(() {
      _scan = res.data;
      _stage = 'review';
      _title.text = '${extracted['achievementTitle'] ?? ''}';
      _org.text = '${extracted['issuingOrganization'] ?? widget.student['university'] ?? ''}';
      final suggested = '${extracted['competencyDomain'] ?? ''}';
      if (widget.field.axisNames.contains(suggested)) _axis = suggested;
    });
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    final res = await ApiService.issueCredential({
      'scanId': _scan!['scanId'],
      'achievementTitle': _title.text.trim(),
      'issuingOrganization': _org.text.trim(),
      'issuanceDate': _scan!['extracted']?['issuanceDate'],
      'competencyDomain': _axis,
      'validationMode': _queue ? 'queue' : 'auto',
    });
    if (!mounted) return;
    setState(() => _submitting = false);
    if (!res.ok) {
      setState(() => _error = res.error);
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    Navigator.pop(context);
    messenger.showSnackBar(SnackBar(content: Text('${res.data['message'] ?? 'Added to your wallet.'}'), behavior: SnackBarBehavior.floating));
    await widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final forensics = Map<String, dynamic>.from(_scan?['forensics'] ?? {});
    final passed = forensics['passed'] == true;
    final gates = (forensics['gates'] as List? ?? const []).map((g) => Map<String, dynamic>.from(g as Map)).toList();

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.of(context).viewInsets.bottom + 20),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            const Text('Add a certificate', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            Text('Checked automatically before it\'s minted to your wallet.', style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
            const SizedBox(height: 14),
            if (_error != null)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5, fontWeight: FontWeight.w600)),
              ),
            if (_stage == 'pick') ...[
              Row(children: [
                for (final (src, icon, label) in [('camera', Icons.photo_camera_outlined, 'Camera'), ('gallery', Icons.photo_library_outlined, 'Photos'), ('files', Icons.description_outlined, 'Files / PDF')]) ...[
                  if (src != 'camera') const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.tonal(
                      onPressed: () => _pick(src),
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                      child: Column(children: [Icon(icon), const SizedBox(height: 4), Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12))]),
                    ),
                  ),
                ],
              ]),
              const SizedBox(height: 10),
              Text('The original PDF or a flat scan works best.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
            ],
            if (_stage == 'scanning')
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 30),
                child: Column(children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 14),
                  Text('Verifying $_fileName', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text('Checking layout, recipient name, issuer and metadata…', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
                ]),
              ),
            if (_stage == 'review') ...[
              if (_preview != null)
                ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(_preview!, height: 140, fit: BoxFit.cover)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: (passed ? TrustTraceTheme.successGreen : TrustTraceTheme.dangerRed).withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: (passed ? TrustTraceTheme.successGreen : TrustTraceTheme.dangerRed).withValues(alpha: 0.4)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Icon(passed ? Icons.verified_user : Icons.gpp_bad, color: passed ? TrustTraceTheme.successGreen : TrustTraceTheme.dangerRed),
                    const SizedBox(width: 8),
                    Expanded(child: Text(passed ? 'Certificate verified' : 'Certificate rejected', style: const TextStyle(fontWeight: FontWeight.w800))),
                    Pill('${forensics['overallConfidence']}%', color: passed ? TrustTraceTheme.successGreen : TrustTraceTheme.dangerRed, filled: true),
                  ]),
                  const SizedBox(height: 8),
                  for (final g in gates)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Icon(g['passed'] == true ? Icons.check_circle : Icons.cancel, size: 16, color: g['passed'] == true ? TrustTraceTheme.successGreen : TrustTraceTheme.dangerRed),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${g['title']}'.replaceFirst(RegExp(r'^Gate \d: '), ''), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                            if (g['passed'] != true || g['gateNumber'] == 2)
                              Text('${g['detail']}', style: TextStyle(fontSize: 11.5, color: Theme.of(context).hintColor)),
                          ]),
                        ),
                      ]),
                    ),
                ]),
              ),
              const SizedBox(height: 12),
              if (passed) ...[
                TextField(controller: _title, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Certificate title', border: OutlineInputBorder(), isDense: true)),
                const SizedBox(height: 10),
                TextField(controller: _org, decoration: const InputDecoration(labelText: 'Issued by', border: OutlineInputBorder(), isDense: true)),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: _axis,
                  decoration: InputDecoration(labelText: 'Skill area (${widget.field.label})', border: const OutlineInputBorder(), isDense: true),
                  items: widget.field.axisNames.map((a) => DropdownMenuItem(value: a, child: Text(a, overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (v) => setState(() => _axis = v ?? _axis),
                ),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: _queue,
                  onChanged: (v) => setState(() => _queue = v),
                  title: const Text('Ask the registrar to review first', style: TextStyle(fontSize: 13.5)),
                ),
                FilledButton(
                  onPressed: _submitting || _title.text.trim().isEmpty ? null : _submit,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
                  child: _submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(_queue ? 'Submit for review' : 'Add to wallet', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
              const SizedBox(height: 6),
              TextButton(onPressed: () => setState(() => _stage = 'pick'), child: Text(passed ? 'Choose another file' : 'Try a different file')),
            ],
          ]),
        ),
      ),
    );
  }
}
