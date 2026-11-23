import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../theme/trusttrace_theme.dart';
import 'common.dart';

/// Recruiter and staff accounts waiting for a registrar decision.
class AccessRequestsCard extends StatefulWidget {
  final List<Map<String, dynamic>> requests;
  final VoidCallback onChanged;
  const AccessRequestsCard({super.key, required this.requests, required this.onChanged});

  @override
  State<AccessRequestsCard> createState() => _AccessRequestsCardState();
}

class _AccessRequestsCardState extends State<AccessRequestsCard> {
  String _busy = '';

  Future<void> _decide(Map<String, dynamic> r, String decision) async {
    var note = '';
    if (decision == 'reject') {
      final ctrl = TextEditingController(text: 'We could not confirm your role from the document provided.');
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Decline ${r['name']}?', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          content: TextField(controller: ctrl, maxLines: 3, decoration: const InputDecoration(labelText: 'Reason (shown to them)', border: OutlineInputBorder())),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: TrustTraceTheme.dangerRed), onPressed: () => Navigator.pop(ctx, true), child: const Text('Decline')),
          ],
        ),
      );
      note = ctrl.text;
      ctrl.dispose();
      if (ok != true) return;
    }
    setState(() => _busy = '${r['id']}:$decision');
    final res = await ApiService.reviewAccess('${r['id']}', decision, note: note);
    if (!mounted) return;
    setState(() => _busy = '');
    showToast(context, res.ok ? '${res.data['message']}' : res.error!, error: !res.ok);
    if (res.ok) widget.onChanged();
  }

  Future<void> _viewProof(Map<String, dynamic> r) async {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _ProofSheet(request: r),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pending = widget.requests.where((r) => r['accountStatus'] == 'pending_verification').toList();
    if (pending.isEmpty) return const SizedBox.shrink();
    final hint = Theme.of(context).hintColor;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Icon(Icons.how_to_reg_outlined, size: 19, color: TrustTraceTheme.linkedInBlue),
              const SizedBox(width: 8),
              const Expanded(child: Text('Account requests', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
              Pill('${pending.length}', color: TrustTraceTheme.linkedInBlue, filled: true),
            ]),
            const Divider(height: 20),
            for (final r in pending) ...[
              Builder(builder: (context) {
                final v = Map<String, dynamic>.from(r['verification'] ?? {});
                final institutional = v['institutionalEmail'] == true;
                final isStaff = r['role'] == 'admin';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      UserAvatar(user: r, size: 40),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${r['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                          Text(
                            isStaff ? '${r['departmentRole'] ?? 'Staff'} · ${r['university'] ?? ''}' : '${r['jobTitle'] ?? 'Recruiter'} · ${r['companyName'] ?? ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: hint),
                          ),
                        ]),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      Pill('${v['emailDomain']}',
                          color: institutional ? TrustTraceTheme.successGreen : TrustTraceTheme.warningAmber,
                          icon: institutional ? Icons.verified_outlined : Icons.mail_outline),
                      if (v['proof'] != null)
                        GestureDetector(onTap: () => _viewProof(r), child: const Pill('View ID', color: TrustTraceTheme.linkedInBlue, icon: Icons.badge_outlined))
                      else
                        Pill('No document', color: hint),
                    ]),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _busy.isNotEmpty ? null : () => _decide(r, 'approve'),
                          style: FilledButton.styleFrom(shape: const StadiumBorder(), visualDensity: VisualDensity.compact),
                          icon: _busy == '${r['id']}:approve'
                              ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.check_rounded, size: 17),
                          label: const Text('Approve', style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy.isNotEmpty ? null : () => _decide(r, 'reject'),
                          style: OutlinedButton.styleFrom(foregroundColor: TrustTraceTheme.dangerRed, shape: const StadiumBorder(), visualDensity: VisualDensity.compact),
                          icon: const Icon(Icons.close_rounded, size: 17),
                          label: const Text('Decline', style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ]),
                  ]),
                );
              }),
            ],
          ]),
        ),
      ),
    );
  }
}

class _ProofSheet extends StatelessWidget {
  final Map<String, dynamic> request;
  const _ProofSheet({required this.request});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      future: ApiService.accessProof('${request['id']}'),
      builder: (context, snap) {
        final proof = snap.data;
        final dataUrl = '${proof?['dataUrl'] ?? ''}';
        final isImage = '${proof?['mimeType'] ?? ''}'.startsWith('image/');
        return SizedBox(
          height: MediaQuery.of(context).size.height * 0.75,
          child: Column(children: [
            Text('${request['name']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            Text('${proof?['fileName'] ?? ''}', style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
            const SizedBox(height: 12),
            Expanded(
              child: snap.connectionState != ConnectionState.done
                  ? const Center(child: CircularProgressIndicator())
                  : proof == null
                      ? const Center(child: Text('Could not load the document.'))
                      : isImage
                          ? InteractiveViewer(child: Image.memory(base64Decode(dataUrl.split(',').last), fit: BoxFit.contain))
                          : const Center(
                              child: Padding(
                                padding: EdgeInsets.all(24),
                                child: Text('This document is a PDF. Open the registrar portal on the web to view it.', textAlign: TextAlign.center),
                              ),
                            ),
            ),
          ]),
        );
      },
    );
  }
}
