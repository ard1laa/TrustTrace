import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../theme/trusttrace_theme.dart';
import '../widgets/common.dart';
import 'document_camera_screen.dart';

/// Shown to recruiter and university accounts until a registrar approves them.
/// The app refreshes on every server change, so approval swaps this screen out live.
class PendingVerificationScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  final Future<void> Function() onRefresh;
  final VoidCallback onLogout;
  const PendingVerificationScreen({super.key, required this.user, required this.onRefresh, required this.onLogout});

  @override
  State<PendingVerificationScreen> createState() => _PendingVerificationScreenState();
}

class _PendingVerificationScreenState extends State<PendingVerificationScreen> {
  bool _busy = false;

  String get _firstName {
    final cleaned = '${widget.user['name'] ?? ''}'.replaceFirst(RegExp(r'^((dr|prof|mr|mrs|ms|ir|ts)\.?\s+)+', caseSensitive: false), '');
    return cleaned.split(' ').first;
  }

  Future<void> _upload(String source) async {
    String? dataUrl;
    String fileName = 'id_document';
    if (source == 'camera') {
      final doc = await captureDocument(context, title: 'Scan your ID');
      if (doc == null) return;
      dataUrl = 'data:image/jpeg;base64,${base64Encode(doc.jpeg)}';
      fileName = 'id_scan.jpg';
    } else {
      final picked = source == 'gallery' ? await ApiService.pickFromGallery() : await ApiService.pickFromFiles();
      if (picked == null) return;
      dataUrl = '${picked['base64Data']}';
      fileName = '${picked['fileName'] ?? fileName}';
    }
    setState(() => _busy = true);
    final res = await ApiService.submitVerificationProof(dataUrl, fileName);
    if (!mounted) return;
    setState(() => _busy = false);
    showToast(context, res.ok ? '${res.data['message']}' : res.error!, error: !res.ok);
    if (res.ok) await widget.onRefresh();
  }

  void _chooseSource() {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final (src, icon, label) in [
            ('camera', Icons.document_scanner_outlined, 'Scan with camera'),
            ('gallery', Icons.photo_library_outlined, 'Choose from Photos'),
            ('files', Icons.picture_as_pdf_outlined, 'Choose a file or PDF'),
          ])
            ListTile(
              leading: Icon(icon, color: TrustTraceTheme.linkedInBlue),
              title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.pop(ctx);
                _upload(src);
              },
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.user;
    final v = Map<String, dynamic>.from(u['verification'] ?? {});
    final rejected = u['accountStatus'] == 'rejected';
    final institutional = v['institutionalEmail'] == true;
    final proof = v['proof'] is Map ? Map<String, dynamic>.from(v['proof']) : null;
    final hint = Theme.of(context).hintColor;
    final tone = rejected ? TrustTraceTheme.dangerRed : TrustTraceTheme.warningAmber;
    final submitted = DateTime.tryParse('${v['submittedAt'] ?? u['createdAt']}');

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 26, 20, 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(
                  child: Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(color: tone.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(18)),
                    child: Icon(rejected ? Icons.gpp_bad_outlined : Icons.hourglass_top_rounded, color: tone, size: 30),
                  ),
                ),
                const SizedBox(height: 16),
                Text(rejected ? 'Verification not approved' : 'Verification in progress',
                    textAlign: TextAlign.center, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                const SizedBox(height: 6),
                Text(
                  rejected
                      ? 'A registrar could not confirm your role. Upload a clearer document to try again.'
                      : 'Hi $_firstName — a registrar is confirming your ${u['role'] == 'admin' ? 'university staff' : 'recruiter'} account. This screen updates the moment you’re approved.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13.5, color: hint, height: 1.4),
                ),
                if (rejected && '${v['note'] ?? ''}'.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: TrustTraceTheme.dangerRed.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(12)),
                    child: Text('Reviewer note: ${v['note']}', style: const TextStyle(fontSize: 12.5)),
                  ),
                ],
                const SizedBox(height: 20),
                _row(context, Icons.mail_outline, 'Email', '${v['emailDomain']} · ${institutional ? (u['role'] == 'admin' ? 'university domain' : 'company domain') : 'personal address'}', institutional),
                _row(context, Icons.badge_outlined, 'Proof document', proof == null ? 'Not uploaded' : '${proof['fileName']} · ${proof['sizeKB']} KB', proof != null),
                _row(context, Icons.schedule_rounded, 'Registrar review',
                    rejected ? 'Declined' : 'Submitted ${submitted == null ? '' : MaterialLocalizations.of(context).formatMediumDate(submitted.toLocal())}', false),
                if (rejected || proof == null) ...[
                  const SizedBox(height: 8),
                  (institutional && !rejected)
                      ? OutlinedButton.icon(
                          onPressed: _busy ? null : _chooseSource,
                          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
                          icon: const Icon(Icons.upload_rounded),
                          label: Text('Add ${u['role'] == 'admin' ? 'staff' : 'corporate'} ID (optional)', style: const TextStyle(fontWeight: FontWeight.w700)),
                        )
                      : FilledButton.icon(
                          onPressed: _busy ? null : _chooseSource,
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), shape: const StadiumBorder()),
                          icon: _busy
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.upload_rounded),
                          label: Text(proof == null ? 'Upload ${u['role'] == 'admin' ? 'staff' : 'corporate'} ID' : 'Upload a new document',
                              style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                ],
                const SizedBox(height: 6),
                TextButton(onPressed: widget.onLogout, child: const Text('Sign out')),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, IconData icon, String title, String body, bool done) {
    final color = done ? TrustTraceTheme.successGreen : Theme.of(context).hintColor;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            Text(body, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Theme.of(context).hintColor)),
          ]),
        ),
      ]),
    );
  }
}
