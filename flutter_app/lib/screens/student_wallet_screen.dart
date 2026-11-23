import 'dart:async';
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
import 'document_camera_screen.dart';

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
              if (cred['achievementType'] != null || cred['requiresScoring'] == true) ...[
                const SizedBox(height: 6),
                CredentialTags(cred),
              ],
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

/// Renders the upload sheet at a given scan result (for layout tests).
@visibleForTesting
Widget uploadSheetForTest({required Map<String, dynamic> student, required Map<String, dynamic> scan}) =>
    _UploadSheet(student: student, field: SkillTaxonomy.forUser(student), onDone: () async {}, initialScan: scan);

class _UploadSheet extends StatefulWidget {
  final Map<String, dynamic> student;
  final FieldOfStudy field;
  final Future<void> Function() onDone;
  final Map<String, dynamic>? initialScan;
  const _UploadSheet({required this.student, required this.field, required this.onDone, this.initialScan});

  @override
  State<_UploadSheet> createState() => _UploadSheetState();
}

const _gateNames = ['Document layout', 'Recipient identity', 'AI template check', 'Issuer & event', 'File metadata', 'Tamper forensics'];

class _UploadSheetState extends State<_UploadSheet> {
  String _stage = 'pick'; // pick | scanning | results | details
  String _fileName = '';
  Uint8List? _preview;
  Map<String, dynamic>? _scan;
  String? _error;
  bool _queue = false;
  bool _submitting = false;
  bool _showGates = false;
  int _progress = 0;
  Timer? _ticker;

  final _title = TextEditingController();
  final _org = TextEditingController();
  final _result = TextEditingController();
  late String _axis = widget.field.axisNames.first;
  String _category = 'Other';
  bool _scoring = false;
  DateTime _date = DateTime.now();
  final Set<String> _auto = {};

  @override
  void initState() {
    super.initState();
    if (widget.initialScan != null) _applyScan(widget.initialScan!);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _title.dispose();
    _org.dispose();
    _result.dispose();
    super.dispose();
  }

  Future<void> _scanWithCamera() async {
    final doc = await captureDocument(context);
    if (doc == null || !mounted) return;
    await _verify(
      fileName: doc.fileName,
      mime: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,${base64Encode(doc.jpeg)}',
      preview: doc.jpeg,
    );
  }

  Future<void> _pick(String source) async {
    final picked = source == 'gallery' ? await ApiService.pickFromGallery() : await ApiService.pickFromFiles();
    if (picked == null) return;
    final mime = '${picked['mimeType'] ?? 'image/jpeg'}';
    final data = '${picked['base64Data'] ?? ''}';
    Uint8List? preview;
    try {
      final b64 = '${picked['previewBase64'] ?? ''}';
      preview = b64.isNotEmpty ? base64Decode(b64) : (mime.startsWith('image/') ? base64Decode(data.split(',').last) : null);
    } catch (_) {}
    await _verify(fileName: '${picked['fileName'] ?? 'certificate'}', mime: mime, dataUrl: data, preview: preview);
  }

  Future<void> _verify({required String fileName, required String mime, required String dataUrl, Uint8List? preview}) async {
    setState(() {
      _stage = 'scanning';
      _fileName = fileName;
      _preview = preview;
      _error = null;
      _progress = 0;
    });
    // Step through the checks while the server works so the wait reads as progress.
    _ticker = Timer.periodic(const Duration(milliseconds: 650), (_) {
      if (mounted && _progress < _gateNames.length - 1) setState(() => _progress++);
    });

    final geometry = mime.startsWith('image/') && preview != null ? await analyzeImageBytes(preview) : null;
    final res = await ApiService.verifyUpload(fileName: fileName, base64Data: dataUrl, mimeType: mime, geometry: geometry);
    _ticker?.cancel();
    if (!mounted) return;
    if (!res.ok) {
      setState(() {
        _stage = 'pick';
        _error = res.error;
      });
      return;
    }
    setState(() => _applyScan(res.data));
  }

  void _applyScan(Map<String, dynamic> scan) {
    final x = Map<String, dynamic>.from(scan['extracted'] ?? {});
    final outcome = '${scan['forensics']?['outcome'] ?? (scan['forensics']?['passed'] == true ? 'verified' : 'rejected')}';
    {
      _scan = scan;
      _fileName = _fileName.isEmpty ? 'certificate.jpg' : _fileName;
      _title.text = '${x['achievementTitle'] ?? ''}';
      _org.text = '${x['issuingOrganization'] ?? widget.student['university'] ?? ''}';
      _result.text = '${x['achievementResult'] ?? ''}';
      _scoring = x['requiresScoring'] == true;
      _category = kCategories.contains(x['achievementType']) ? x['achievementType'] as String : 'Other';
      _date = DateTime.tryParse('${x['issuanceDate']}') ?? DateTime.now();
      final suggested = '${x['competencyDomain'] ?? ''}';
      if (widget.field.axisNames.contains(suggested)) _axis = suggested;
      _auto
        ..clear()
        ..addAll([
          if (_title.text.isNotEmpty) 'title',
          if (x['issuingOrganization'] != null) 'org',
          if (x['issuanceDate'] != null) 'date',
          if (_category != 'Other') 'category',
          if (_scoring) 'scoring',
        ]);
      // A clean pass goes straight to the pre-filled form.
      _stage = outcome == 'verified' ? 'details' : 'results';
    }
  }

  Future<void> _submit() async {
    final forced = _scan?['forensics']?['outcome'] == 'review';
    setState(() {
      _submitting = true;
      _error = null;
    });
    final res = await ApiService.issueCredential({
      'scanId': _scan!['scanId'],
      'achievementTitle': _title.text.trim(),
      'issuingOrganization': _org.text.trim(),
      'issuanceDate': _date.toIso8601String().substring(0, 10),
      'competencyDomain': _axis,
      'achievementType': _category,
      'requiresScoring': _scoring,
      'achievementResult': _scoring ? _result.text.trim() : '',
      'validationMode': _queue || forced ? 'queue' : 'auto',
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

  // ---------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final stepIndex = switch (_stage) { 'pick' => 0, 'details' => 2, _ => 1 };
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            const Text('Add a certificate', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.2)),
            const SizedBox(height: 10),
            _Steps(index: stepIndex),
            const SizedBox(height: 16),
            if (_error != null) _ErrorBox(_error!),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: KeyedSubtree(
                key: ValueKey(_stage),
                child: switch (_stage) {
                  'pick' => _pickStage(context),
                  'scanning' => _scanningStage(context),
                  'results' => _resultsStage(context),
                  _ => _detailsStage(context),
                },
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _pickStage(BuildContext context) {
    final hint = Theme.of(context).hintColor;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Material(
        color: TrustTraceTheme.linkedInBlue,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: _scanWithCamera,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.document_scanner_outlined, color: Colors.white),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Scan with camera', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15.5)),
                  SizedBox(height: 2),
                  Text('Guided capture, cropped automatically', style: TextStyle(color: Colors.white70, fontSize: 12.5)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: Colors.white),
            ]),
          ),
        ),
      ),
      const SizedBox(height: 10),
      Row(children: [
        for (final (src, icon, label) in [('gallery', Icons.photo_library_outlined, 'Photos'), ('files', Icons.picture_as_pdf_outlined, 'Files / PDF')]) ...[
          if (src == 'files') const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _pick(src),
              icon: Icon(icon, size: 19),
              label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
            ),
          ),
        ],
      ]),
      const SizedBox(height: 12),
      Text('The original PDF gives the most reliable result.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: hint)),
    ]);
  }

  Widget _fileStrip(BuildContext context, {String? badge, Color? badgeColor}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: isDark ? TrustTraceTheme.darkBg : TrustTraceTheme.lightBg, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: _preview != null
              ? Image.memory(_preview!, width: 56, height: 40, fit: BoxFit.cover)
              : Container(width: 56, height: 40, color: Theme.of(context).cardColor, child: const Icon(Icons.description_outlined, color: TrustTraceTheme.linkedInBlue)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(_fileName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
        if (badge != null) Pill(badge, color: badgeColor ?? TrustTraceTheme.successGreen, filled: true),
      ]),
    );
  }

  Widget _scanningStage(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _fileStrip(context),
      const SizedBox(height: 14),
      for (var i = 0; i < _gateNames.length; i++)
        AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: i > _progress ? 0.45 : 1,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(children: [
              SizedBox(
                width: 18,
                height: 18,
                child: i < _progress
                    ? const Icon(Icons.check_circle_rounded, size: 18, color: TrustTraceTheme.successGreen)
                    : i == _progress
                        ? const CircularProgressIndicator(strokeWidth: 2.2)
                        : Icon(Icons.radio_button_unchecked, size: 18, color: Theme.of(context).dividerColor),
              ),
              const SizedBox(width: 10),
              Text(_gateNames[i], style: TextStyle(fontSize: 13.5, fontWeight: i == _progress ? FontWeight.w700 : FontWeight.w500)),
            ]),
          ),
        ),
      const SizedBox(height: 8),
      Text('Reading the text, checking the name for edits and looking the event up online…',
          style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
    ]);
  }

  (String, Color, IconData, String) _outcomeLook(String outcome) => switch (outcome) {
        'verified' => ('Verified — all 6 checks passed', TrustTraceTheme.successGreen, Icons.verified_user_rounded, 'Passed all six checks.'),
        'review' => (
            'Needs a registrar check',
            TrustTraceTheme.warningAmber,
            Icons.policy_outlined,
            'We found signs the certificate may have been edited. You can still submit it — a registrar will review it first.'
          ),
        _ => ('Certificate rejected', TrustTraceTheme.dangerRed, Icons.gpp_bad_outlined, 'This file can’t be added to your wallet.'),
      };

  Widget _gateList(BuildContext context, List<Map<String, dynamic>> gates) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final g in gates)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(
              switch ('${g['status'] ?? (g['passed'] == true ? 'pass' : 'fail')}') {
                'pass' => Icons.check_circle_rounded,
                'warn' => Icons.error_rounded,
                _ => Icons.cancel_rounded,
              },
              size: 17,
              color: switch ('${g['status'] ?? (g['passed'] == true ? 'pass' : 'fail')}') {
                'pass' => TrustTraceTheme.successGreen,
                'warn' => TrustTraceTheme.warningAmber,
                _ => TrustTraceTheme.dangerRed,
              },
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${g['title']}'.replaceFirst(RegExp(r'^Gate \d: '), ''), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                if (g['status'] != 'pass' || [2, 4, 6].contains(g['gateNumber']))
                  Text('${g['detail']}', style: TextStyle(fontSize: 11.5, color: Theme.of(context).hintColor, height: 1.3)),
              ]),
            ),
          ]),
        ),
    ]);
  }

  Widget _resultsStage(BuildContext context) {
    final forensics = Map<String, dynamic>.from(_scan?['forensics'] ?? {});
    final outcome = '${forensics['outcome'] ?? (forensics['passed'] == true ? 'verified' : 'rejected')}';
    final (title, color, icon, body) = _outcomeLook(outcome);
    final gates = (forensics['gates'] as List? ?? const []).map((g) => Map<String, dynamic>.from(g as Map)).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _fileStrip(context, badge: '${forensics['overallConfidence']}%', badgeColor: color),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(title, style: TextStyle(fontWeight: FontWeight.w800, color: color))),
          ]),
          const SizedBox(height: 4),
          Text(body, style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor, height: 1.35)),
        ]),
      ),
      const SizedBox(height: 12),
      _gateList(context, gates),
      const SizedBox(height: 14),
      Row(children: [
        Expanded(
          child: OutlinedButton(
            onPressed: () => setState(() => _stage = 'pick'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
            child: const Text('Try another file', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
        if (outcome != 'rejected') ...[
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton(
              onPressed: () => setState(() => _stage = 'details'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
              child: const Text('Continue', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ]),
    ]);
  }

  Widget _label(String text, {String? autoKey}) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Row(children: [
          Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700))),
          if (autoKey != null && _auto.contains(autoKey))
            const Row(children: [
              Icon(Icons.auto_awesome, size: 13, color: TrustTraceTheme.linkedInBlue),
              SizedBox(width: 3),
              Text('Auto', style: TextStyle(fontSize: 11, color: TrustTraceTheme.linkedInBlue, fontWeight: FontWeight.w700)),
            ]),
        ]),
      );

  Widget _detailsStage(BuildContext context) {
    final forensics = Map<String, dynamic>.from(_scan?['forensics'] ?? {});
    final outcome = '${forensics['outcome'] ?? 'verified'}';
    final forced = outcome == 'review';
    final (title, color, icon, _) = _outcomeLook(outcome);
    final gates = (forensics['gates'] as List? ?? const []).map((g) => Map<String, dynamic>.from(g as Map)).toList();
    final hint = Theme.of(context).hintColor;
    const dec = InputDecoration(border: OutlineInputBorder(), isDense: true);

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _fileStrip(context, badge: '${forensics['overallConfidence']}%', badgeColor: color),
      const SizedBox(height: 10),
      Material(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => setState(() => _showGates = !_showGates),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Icon(icon, size: 19, color: color),
                const SizedBox(width: 8),
                Expanded(child: Text(title, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: color))),
                Icon(_showGates ? Icons.expand_less : Icons.expand_more, color: hint),
              ]),
              if (_showGates) ...[const SizedBox(height: 8), _gateList(context, gates)],
            ]),
          ),
        ),
      ),
      const SizedBox(height: 12),
      Row(children: [
        const Icon(Icons.auto_awesome, size: 15, color: TrustTraceTheme.linkedInBlue),
        const SizedBox(width: 6),
        Expanded(child: Text('Filled in from your certificate — check and adjust if needed.', style: TextStyle(fontSize: 12, color: hint))),
      ]),
      const SizedBox(height: 14),
      _label('Title', autoKey: 'title'),
      TextField(controller: _title, onChanged: (_) => setState(() => _auto.remove('title')), decoration: dec),
      const SizedBox(height: 14),
      _label('Type', autoKey: 'category'),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final c in kCategories)
          ChoiceChip(
            showCheckmark: false,
            avatar: Icon(categoryStyle(c).$1, size: 16, color: _category == c ? Colors.white : categoryStyle(c).$2),
            label: Text(c),
            selected: _category == c,
            selectedColor: TrustTraceTheme.linkedInBlue,
            labelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: _category == c ? Colors.white : null),
            shape: const StadiumBorder(),
            onSelected: (_) => setState(() {
              _category = c;
              _auto.remove('category');
            }),
          ),
      ]),
      const SizedBox(height: 14),
      _label('Issued by', autoKey: 'org'),
      TextField(controller: _org, onChanged: (_) => setState(() => _auto.remove('org')), decoration: dec),
      const SizedBox(height: 14),
      _label('Date', autoKey: 'date'),
      InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () async {
          final picked = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(1990), lastDate: DateTime.now().add(const Duration(days: 365)));
          if (picked != null) {
            setState(() {
              _date = picked;
              _auto.remove('date');
            });
          }
        },
        child: InputDecorator(
          decoration: dec.copyWith(suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18)),
          child: Text(MaterialLocalizations.of(context).formatMediumDate(_date)),
        ),
      ),
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.fromLTRB(12, 4, 6, 4),
        decoration: BoxDecoration(border: Border.all(color: Theme.of(context).dividerColor), borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _scoring,
            onChanged: (v) => setState(() {
              _scoring = v;
              _auto.remove('scoring');
            }),
            title: Row(children: [
              const Flexible(child: Text('Includes a result or placement', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))),
              if (_auto.contains('scoring')) ...[
                const SizedBox(width: 6),
                const Icon(Icons.auto_awesome, size: 13, color: TrustTraceTheme.linkedInBlue),
              ],
            ]),
          ),
          if (_scoring)
            Padding(
              padding: const EdgeInsets.only(right: 6, bottom: 10),
              child: TextField(
                controller: _result,
                maxLength: 60,
                decoration: dec.copyWith(hintText: 'e.g. 1st Place, Champion, CGPA 3.85', counterText: ''),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 14),
      _label('Skill area · ${widget.field.label}'),
      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: _axis,
        decoration: dec,
        items: widget.field.axisNames.map((a) => DropdownMenuItem(value: a, child: Text(a, overflow: TextOverflow.ellipsis))).toList(),
        onChanged: (v) => setState(() => _axis = v ?? _axis),
      ),
      const SizedBox(height: 10),
      if (forced)
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: TrustTraceTheme.warningAmber.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
          child: const Row(children: [
            Icon(Icons.schedule_rounded, size: 18, color: TrustTraceTheme.warningAmber),
            SizedBox(width: 8),
            Expanded(child: Text('This certificate will be reviewed by a registrar before it’s minted.', style: TextStyle(fontSize: 12.5))),
          ]),
        )
      else
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _queue,
          onChanged: (v) => setState(() => _queue = v),
          title: const Text('Ask the registrar to review first', style: TextStyle(fontSize: 13.5)),
        ),
      const SizedBox(height: 8),
      FilledButton(
        onPressed: _submitting || _title.text.trim().isEmpty || (_scoring && _result.text.trim().isEmpty) ? null : _submit,
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), shape: const StadiumBorder()),
        child: _submitting
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(_queue || forced ? 'Submit for review' : 'Add to wallet', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      ),
      TextButton(onPressed: () => setState(() => _stage = 'pick'), child: const Text('Start over')),
    ]);
  }
}

class _Steps extends StatelessWidget {
  final int index;
  const _Steps({required this.index});

  @override
  Widget build(BuildContext context) {
    const labels = ['Upload', 'Verify', 'Details'];
    return Row(children: [
      for (var i = 0; i < labels.length; i++) ...[
        if (i > 0) const SizedBox(width: 6),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              height: 4,
              decoration: BoxDecoration(
                color: i <= index ? TrustTraceTheme.linkedInBlue : Theme.of(context).dividerColor,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 5),
            Text(labels[i],
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: i == index ? TrustTraceTheme.linkedInBlue : Theme.of(context).hintColor,
                )),
          ]),
        ),
      ],
    ]);
  }
}

class _ErrorBox extends StatelessWidget {
  final String message;
  const _ErrorBox(this.message);

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(color: TrustTraceTheme.dangerRed.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.error_outline, color: TrustTraceTheme.dangerRed, size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(message, style: const TextStyle(color: TrustTraceTheme.dangerRed, fontSize: 12.5, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}
