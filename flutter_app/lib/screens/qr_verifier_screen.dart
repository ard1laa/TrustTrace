import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../core/skill_taxonomy.dart';
import '../services/api_service.dart';
import '../services/verification_service.dart';
import '../theme/trusttrace_theme.dart';
import '../widgets/common.dart';
import '../widgets/verification_result_view.dart';

class QrVerifierScreen extends StatefulWidget {
  final Map<String, dynamic> recruiter;
  final List<Map<String, dynamic>> students;
  final List<Map<String, dynamic>> credentials;
  final bool offline;

  const QrVerifierScreen({super.key, required this.recruiter, required this.students, required this.credentials, required this.offline});

  @override
  State<QrVerifierScreen> createState() => _QrVerifierScreenState();
}

class _QrVerifierScreenState extends State<QrVerifierScreen> {
  int _tab = 0;
  bool _scanning = false;
  bool _verifying = false;
  VerificationOutcome? _outcome;
  List<Map<String, dynamic>> _shortlist = [];

  final _lookup = TextEditingController();
  final _query = TextEditingController();
  String _fieldFilter = 'ALL';
  double _minScore = 0;

  String get _recruiterId => '${widget.recruiter['id']}';

  @override
  void initState() {
    super.initState();
    _loadShortlist();
  }

  @override
  void dispose() {
    _lookup.dispose();
    _query.dispose();
    super.dispose();
  }

  Future<void> _loadShortlist() async {
    final list = await ApiService.getRecruiterShortlist(_recruiterId);
    if (mounted) setState(() => _shortlist = list);
  }

  // Decodes a QR code from a saved photo or screenshot.
  Future<void> _verifyImage() async {
    final picked = await ApiService.pickFromGallery();
    final path = '${picked?['filePath'] ?? ''}';
    if (path.isEmpty || !mounted) return;
    setState(() => _scanning = false);
    String raw = '';
    final controller = MobileScannerController(autoStart: false);
    try {
      final capture = await controller.analyzeImage(path);
      raw = capture?.barcodes.map((b) => b.rawValue ?? '').firstWhere((v) => v.isNotEmpty, orElse: () => '') ?? '';
    } catch (_) {
    } finally {
      unawaited(controller.dispose());
    }
    if (!mounted) return;
    if (raw.isEmpty) {
      showToast(context, 'No QR code found in that image. Make sure the whole code is visible, in focus and not cropped.', error: true);
      return;
    }
    await _verify(raw);
  }

  Future<void> _verify(String raw) async {
    if (raw.trim().isEmpty || _verifying) return;
    setState(() {
      _verifying = true;
      _scanning = false;
      _tab = 0;
    });
    final outcome = await VerificationService.verify(raw);
    if (!mounted) return;
    setState(() {
      _verifying = false;
      _outcome = outcome.error == null ? outcome : null;
    });
    if (outcome.error != null) showToast(context, outcome.error!, error: true);
  }

  Future<void> _saveToShortlist(String studentUserId) async {
    final res = await ApiService.saveToRecruiterShortlist(_recruiterId, studentUserId);
    if (!mounted) return;
    if (res.ok) {
      setState(() => _shortlist = ApiService.credentialsOf(res.data['shortlist']));
      showToast(context, 'Saved to your shortlist.');
    } else {
      showToast(context, res.error!, error: true);
    }
  }

  Future<void> _removeFromShortlist(String studentUserId) async {
    final res = await ApiService.removeFromRecruiterShortlist(_recruiterId, studentUserId);
    if (!mounted) return;
    if (res.ok) setState(() => _shortlist = ApiService.credentialsOf(res.data['shortlist']));
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: pagePadding(context),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                UserAvatar(user: widget.recruiter, size: 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${widget.recruiter['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800)),
                    Text(
                      [widget.recruiter['jobTitle'], widget.recruiter['companyName']].where((v) => '${v ?? ''}'.isNotEmpty).join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor),
                    ),
                  ]),
                ),
                if (widget.offline) const Pill('Offline', color: TrustTraceTheme.warningAmber, icon: Icons.cloud_off_outlined),
              ]),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<int>(
                  showSelectedIcon: false,
                  segments: [
                    const ButtonSegment(value: 0, icon: Icon(Icons.qr_code_scanner, size: 16), label: Text('Verify', overflow: TextOverflow.ellipsis)),
                    ButtonSegment(value: 1, icon: const Icon(Icons.bookmark_outline, size: 16), label: Text('Saved (${_shortlist.length})', overflow: TextOverflow.ellipsis)),
                    const ButtonSegment(value: 2, icon: Icon(Icons.search, size: 16), label: Text('Search', overflow: TextOverflow.ellipsis)),
                  ],
                  selected: {_tab},
                  onSelectionChanged: (s) => setState(() => _tab = s.first),
                ),
              ),
            ]),
          ),
        ),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: KeyedSubtree(key: ValueKey(_tab), child: _tab == 0 ? _verifyTab() : _tab == 1 ? _shortlistTab() : _searchTab()),
        ),
      ],
    );
  }

  Widget _verifyTab() {
    final holderId = _outcome?.holder['id']?.toString();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionCard(
        title: 'Verify a candidate',
        icon: Icons.verified_user_outlined,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: _verifying ? null : () => setState(() => _scanning = !_scanning),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
                icon: Icon(_scanning ? Icons.close : Icons.qr_code_scanner),
                label: Text(_scanning ? 'Close camera' : 'Scan QR code', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
            const SizedBox(width: 8),
            Tooltip(
              message: 'Upload a QR image',
              child: OutlinedButton(
                onPressed: _verifying ? null : _verifyImage,
                style: OutlinedButton.styleFrom(minimumSize: const Size(52, 48), padding: EdgeInsets.zero, shape: const StadiumBorder()),
                child: const Icon(Icons.image_search_rounded, semanticLabel: 'Upload a QR image'),
              ),
            ),
          ]),
          if (_scanning) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: 260,
                child: MobileScanner(
                  onDetect: (capture) {
                    final raw = capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue ?? '' : '';
                    if (raw.isNotEmpty && !_verifying) _verify(raw);
                  },
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _lookup,
            autocorrect: false,
            onSubmitted: _verify,
            decoration: InputDecoration(
              labelText: 'Or paste a portfolio link, DID or student ID',
              border: const OutlineInputBorder(),
              isDense: true,
              suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: () => _verify(_lookup.text)),
            ),
          ),
          if (widget.offline)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Offline: only Offline QR codes can be checked (signatures on this device; revocation is checked when you reconnect). Quick-scan QR codes need a connection.',
                  style: TextStyle(fontSize: 11.5, color: Theme.of(context).hintColor)),
            ),
        ]),
      ),
      if (_verifying) const Padding(padding: EdgeInsets.all(28), child: Center(child: CircularProgressIndicator())),
      if (!_verifying && _outcome != null)
        VerificationResultView(
          outcome: _outcome!,
          actions: [
            if (!_outcome!.offline && holderId != null && !_shortlist.any((e) => e['studentUserId'] == holderId))
              FilledButton.icon(onPressed: () => _saveToShortlist(holderId), icon: const Icon(Icons.bookmark_add_outlined, size: 18), label: const Text('Save')),
            OutlinedButton.icon(onPressed: () => setState(() => _outcome = null), icon: const Icon(Icons.close, size: 18), label: const Text('Clear')),
          ],
        ),
      if (!_verifying && _outcome == null)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(26),
            child: Text('Scan or upload a candidate\'s TrustTrace QR code to check their credentials. Signatures are verified on this device.',
                textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor)),
          ),
        ),
    ]);
  }

  Widget _studentTile(Map<String, dynamic> stu, {Widget? trailing, String? subtitle}) {
    final field = SkillTaxonomy.forUser(stu);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: UserAvatar(user: stu, size: 42),
      title: Text('${stu['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle ?? [field.label, if ('${stu['university'] ?? ''}'.isNotEmpty) stu['university']].join(' · '),
          maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: trailing,
      onTap: () => _verify('${stu['did']}'),
    );
  }

  Widget _shortlistTab() {
    final entries = _shortlist
        .map((e) => (e, widget.students.where((s) => s['id'] == e['studentUserId']).firstOrNull))
        .where((pair) => pair.$2 != null)
        .toList();
    return SectionCard(
      title: 'Saved candidates',
      icon: Icons.bookmark_outline,
      child: entries.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Text('Candidates you save appear here.', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor)),
            )
          : Column(
              children: entries
                  .map((pair) => _studentTile(
                        pair.$2!,
                        subtitle: 'Status: ${pair.$1['status'] ?? 'Shortlisted'}',
                        trailing: IconButton(
                          tooltip: 'Remove',
                          icon: const Icon(Icons.delete_outline, color: TrustTraceTheme.dangerRed),
                          onPressed: widget.offline ? null : () => _removeFromShortlist('${pair.$2!['id']}'),
                        ),
                      ))
                  .toList(),
            ),
    );
  }

  Widget _searchTab() {
    final q = _query.text.trim().toLowerCase();
    final results = widget.students.where((stu) {
      if (stu['visibleInTalentSearch'] == false) return false;
      final field = SkillTaxonomy.forUser(stu);
      if (_fieldFilter != 'ALL' && field.familyId != _fieldFilter) return false;
      if (q.isNotEmpty && !'${stu['name']} ${stu['university']} ${field.label} ${stu['studentId']}'.toLowerCase().contains(q)) return false;
      final creds = widget.credentials.where((c) => c['studentUserId'] == stu['id'] && c['state'] == 'Locked' && c['isPublic'] != false).toList();
      if (_minScore > 0) {
        if (creds.isEmpty) return false;
        final avg = creds.map((c) => num.tryParse('${c['masteryScore']}') ?? 0).reduce((a, b) => a + b) / creds.length;
        if (avg < _minScore) return false;
      }
      return true;
    }).toList();

    return SectionCard(
      title: 'Talent search',
      icon: Icons.search,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(
          controller: _query,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Name, university or field', border: OutlineInputBorder(), isDense: true),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _fieldFilter,
          decoration: const InputDecoration(labelText: 'Field of study', border: OutlineInputBorder(), isDense: true),
          items: [
            const DropdownMenuItem(value: 'ALL', child: Text('All fields')),
            ...SkillTaxonomy.families.map((f) => DropdownMenuItem(value: f.id, child: Text(f.label, overflow: TextOverflow.ellipsis))),
          ],
          onChanged: (v) => setState(() => _fieldFilter = v ?? 'ALL'),
        ),
        const SizedBox(height: 6),
        Row(children: [
          const Text('Minimum score', style: TextStyle(fontSize: 12.5)),
          Expanded(
            child: Slider(
              value: _minScore,
              min: 0,
              max: 100,
              divisions: 10,
              label: _minScore == 0 ? 'Any' : '${_minScore.round()}%',
              onChanged: (v) => setState(() => _minScore = v),
            ),
          ),
          SizedBox(width: 40, child: Text(_minScore == 0 ? 'Any' : '${_minScore.round()}%', textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w700))),
        ]),
        const Divider(),
        if (results.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text('No candidates match these filters.', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).hintColor)),
          )
        else
          ...results.map((stu) => _studentTile(
                stu,
                trailing: IconButton(
                  tooltip: 'Save',
                  icon: Icon(_shortlist.any((e) => e['studentUserId'] == stu['id']) ? Icons.bookmark : Icons.bookmark_add_outlined, color: TrustTraceTheme.linkedInBlue),
                  onPressed: widget.offline ? null : () => _saveToShortlist('${stu['id']}'),
                ),
              )),
      ]),
    );
  }
}
