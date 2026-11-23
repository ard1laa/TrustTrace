import 'dart:convert';
import 'package:flutter/material.dart';
import '../core/skill_taxonomy.dart';
import '../theme/trusttrace_theme.dart';

String initialsOf(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
  final out = parts.map((p) => p[0].toUpperCase()).join();
  return out.isEmpty ? '?' : out;
}

class UserAvatar extends StatelessWidget {
  final Map<String, dynamic>? user;
  final double size;
  final bool ring;
  const UserAvatar({super.key, required this.user, this.size = 40, this.ring = false});

  @override
  Widget build(BuildContext context) {
    final url = (user?['avatarUrl'] ?? '').toString();
    ImageProvider? image;
    if (url.startsWith('data:image')) {
      try {
        image = MemoryImage(base64Decode(url.split(',').last));
      } catch (_) {}
    } else if (url.startsWith('https://')) {
      image = NetworkImage(url);
    }
    final avatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: image == null
            ? const LinearGradient(colors: [TrustTraceTheme.linkedInBlue, TrustTraceTheme.linkedInHover], begin: Alignment.topLeft, end: Alignment.bottomRight)
            : null,
        image: image == null ? null : DecorationImage(image: image, fit: BoxFit.cover),
      ),
      alignment: Alignment.center,
      child: image == null
          ? Text(initialsOf(user?['name']?.toString()),
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.36))
          : null,
    );
    if (!ring) return avatar;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Theme.of(context).cardColor,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: avatar,
    );
  }
}

/// Programme picker: a field that opens a searchable, grouped bottom sheet.
class FieldDropdown extends StatelessWidget {
  final String? value;
  final ValueChanged<String> onChanged;
  final String label;
  const FieldDropdown({super.key, required this.value, required this.onChanged, this.label = 'Programme'});

  @override
  Widget build(BuildContext context) {
    final selected = value == null || value!.isEmpty ? null : SkillTaxonomy.resolve(value);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () async {
            final picked = await showProgramPicker(context, selectedId: selected?.id);
            if (picked != null) onChanged(picked);
          },
          child: InputDecorator(
            isEmpty: selected == null,
            decoration: InputDecoration(
              labelText: label,
              hintText: 'Search your programme',
              border: const OutlineInputBorder(),
              isDense: true,
              suffixIcon: const Icon(Icons.unfold_more_rounded, size: 20),
            ),
            child: selected == null ? null : Text(selected.label, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ),
        if (selected != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 2),
            child: Text(
              'Skill radar: ${selected.axisNames.join(' · ')}',
              style: TextStyle(fontSize: 11.5, color: Theme.of(context).hintColor),
            ),
          ),
      ],
    );
  }
}

Future<String?> showProgramPicker(BuildContext context, {String? selectedId}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _ProgramPickerSheet(selectedId: selectedId),
  );
}

class _ProgramPickerSheet extends StatefulWidget {
  final String? selectedId;
  const _ProgramPickerSheet({this.selectedId});

  @override
  State<_ProgramPickerSheet> createState() => _ProgramPickerSheetState();
}

class _ProgramPickerSheetState extends State<_ProgramPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final groups = SkillTaxonomy.groups
        .map((g) => ProgramGroup(
              g.family,
              q.isEmpty
                  ? g.programs
                  : g.programs.where((p) => [p.label, g.family.label, ...p.aliases].any((s) => s.toLowerCase().contains(q))).toList(),
            ))
        .where((g) => g.programs.isNotEmpty)
        .toList();
    final hint = Theme.of(context).hintColor;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              autofocus: true,
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: 'Search — e.g. Accounting, Law, Nursing',
                prefixIcon: const Icon(Icons.search, size: 20),
                filled: true,
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              ),
            ),
          ),
          Expanded(
            child: groups.isEmpty
                ? Center(child: Text('No match — choose “Other”.', style: TextStyle(color: hint)))
                : ListView(
                    controller: scroll,
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      for (final g in groups) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
                          child: Text(g.family.label.toUpperCase(),
                              style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.7, color: hint)),
                        ),
                        for (final p in g.programs)
                          ListTile(
                            dense: true,
                            visualDensity: VisualDensity.compact,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                            title: Text(p.label,
                                style: TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: p.id == widget.selectedId ? FontWeight.w700 : FontWeight.w500,
                                  color: p.id == widget.selectedId ? TrustTraceTheme.linkedInBlue : null,
                                )),
                            trailing: p.id == widget.selectedId ? const Icon(Icons.check_rounded, color: TrustTraceTheme.linkedInBlue, size: 20) : null,
                            onTap: () => Navigator.pop(context, p.id),
                          ),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

/// Small rounded label used for skill areas and statuses.
class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final bool filled;
  final IconData? icon;
  const Pill(this.text, {super.key, required this.color, this.filled = false, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: filled ? Colors.white : color), const SizedBox(width: 3)],
          Flexible(
            child: Text(text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: filled ? Colors.white : color)),
          ),
        ],
      ),
    );
  }
}

/// Card with a title row; keeps spacing consistent across screens.
class SectionCard extends StatelessWidget {
  final String? title;
  final IconData? icon;
  final Widget? trailing;
  final Widget child;
  final EdgeInsets padding;
  const SectionCard({super.key, this.title, this.icon, this.trailing, required this.child, this.padding = const EdgeInsets.all(16)});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Row(
                children: [
                  if (icon != null) ...[Icon(icon, size: 18, color: TrustTraceTheme.linkedInBlue), const SizedBox(width: 8)],
                  Expanded(
                    child: Text(title!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

void showToast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? TrustTraceTheme.dangerRed : null,
    ));
}

// ---------------------------------------------------------------------------
// Certificate categories ("Hackathon") and results ("1st Place")
// ---------------------------------------------------------------------------
const kCategories = ['Competition', 'Hackathon', 'Workshop', 'Seminar', 'Other'];

(IconData, Color) categoryStyle(String? type) => switch (type) {
      'Competition' => (Icons.emoji_events_outlined, const Color(0xFFB45309)),
      'Hackathon' => (Icons.code_rounded, const Color(0xFF7C3AED)),
      'Workshop' => (Icons.construction_rounded, const Color(0xFF0F766E)),
      'Seminar' => (Icons.mic_none_rounded, const Color(0xFF0369A1)),
      _ => (Icons.sell_outlined, const Color(0xFF6B7280)),
    };

/// Category and result chips for a credential; empty when neither is set.
class CredentialTags extends StatelessWidget {
  final Map<String, dynamic> cred;
  const CredentialTags(this.cred, {super.key});

  @override
  Widget build(BuildContext context) {
    final type = cred['achievementType']?.toString();
    final result = cred['requiresScoring'] == true ? '${cred['achievementResult'] ?? ''}' : '';
    if ((type == null || type.isEmpty) && result.isEmpty) return const SizedBox.shrink();
    final (icon, color) = categoryStyle(type);
    return Wrap(spacing: 6, runSpacing: 6, children: [
      if (type != null && type.isNotEmpty) Pill(type, color: color, icon: icon),
      if (result.isNotEmpty) Pill(result, color: TrustTraceTheme.linkedInBlue, icon: Icons.military_tech_outlined),
    ]);
  }
}
