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

class FieldDropdown extends StatelessWidget {
  final String? value;
  final ValueChanged<String> onChanged;
  const FieldDropdown({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final selected = SkillTaxonomy.fields.where((f) => f.id == value).firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: selected?.id,
          hint: const Text('Select your field'),
          decoration: const InputDecoration(labelText: 'Field of study', border: OutlineInputBorder(), isDense: true),
          items: SkillTaxonomy.fields
              .map((f) => DropdownMenuItem(value: f.id, child: Text(f.label, overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (v) => v == null ? null : onChanged(v),
        ),
        if (selected != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 2),
            child: Text(
              'Your skill radar will show: ${selected.axisNames.join(', ')}.',
              style: TextStyle(fontSize: 11.5, color: Theme.of(context).hintColor),
            ),
          ),
      ],
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
