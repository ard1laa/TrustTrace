import 'package:flutter_test/flutter_test.dart';
import 'package:trusttrace_mobile/core/skill_taxonomy.dart';

void main() {
  test('free-text programmes resolve to the same field as the web app', () {
    // Expected values mirror shared/skillTaxonomy.js resolveField().
    const cases = {
      'BSc Computer Science': ['computer-science', 'computer-science'],
      'Biotechnology': ['biotechnology', 'biology'],
      'History': ['history', 'humanities'],
      'engineering': ['engineering', 'engineering'],
      'Bachelor of Accounting (Hons)': ['accounting', 'business'],
      'BSc IT': ['information-technology', 'computer-science'],
      'Diploma in Graphic Design': ['graphic-design', 'creative'],
      'MBBS': ['medicine', 'health-sciences'],
      'LLB (Hons)': ['law', 'law-politics'],
      '': ['others', 'others'],
    };
    cases.forEach((input, expected) {
      final f = SkillTaxonomy.resolve(input);
      expect([f.id, f.familyId], expected, reason: input);
    });
  });

  test('every programme belongs to a family with six axes', () {
    for (final p in SkillTaxonomy.programs) {
      expect(SkillTaxonomy.byId(p.id).axes.length, 6, reason: p.id);
    }
  });

  test('legacy domains map onto the field axes', () {
    final cs = SkillTaxonomy.byId('computer-science');
    expect(SkillTaxonomy.axisFor({'competencyDomain': 'Technical Engineering', 'achievementTitle': 'Award'}, cs), 'System Architecture');
    expect(SkillTaxonomy.axisFor({'competencyDomain': 'Leadership', 'achievementTitle': 'Python bootcamp'}, cs), 'Programming');
  });
}
