import 'package:flutter_test/flutter_test.dart';
import 'package:trusttrace_mobile/core/skill_taxonomy.dart';

void main() {
  test('free-text programs resolve to a field', () {
    expect(SkillTaxonomy.resolve('BSc Computer Science').id, 'computer-science');
    expect(SkillTaxonomy.resolve('Biotechnology').id, 'biology');
    expect(SkillTaxonomy.resolve('History').id, 'others');
  });

  test('legacy domains map onto the field axes', () {
    final cs = SkillTaxonomy.byId('computer-science');
    expect(SkillTaxonomy.axisFor({'competencyDomain': 'Technical Engineering', 'achievementTitle': 'Award'}, cs), 'System Architecture');
    expect(SkillTaxonomy.axisFor({'competencyDomain': 'Leadership', 'achievementTitle': 'Python bootcamp'}, cs), 'Programming');
  });
}
