import 'package:flutter_test/flutter_test.dart';

import 'package:medtravelapp/main.dart';

void main() {
  testWidgets('App arranca y muestra el login (sin sesión guardada)', (WidgetTester tester) async {
    await tester.pumpWidget(const MedTravelApp());
    await tester.pump();
    expect(find.text('MedTravelApp'), findsWidgets);
  });
}
