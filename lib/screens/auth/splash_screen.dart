import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../home/home_screen.dart';
import 'login_screen.dart';

/// Shown at app startup.
/// Checks for a saved session token — if found, goes straight to HomeScreen.
/// If not found (or token missing), goes to LoginScreen.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _animCtrl;
  late Animation<double> _fadeAnim;

  static const Color kRed     = Color(0xFF8B1E3F);
  static const Color kRedDark = Color(0xFF5C1229);

  @override
  void initState() {
    super.initState();

    // Fade-in animation for the logo
    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeIn);
    _animCtrl.forward();

    // Check session after a short delay so the splash is visible
    Future.delayed(const Duration(milliseconds: 1500), _checkSession);
  }

  Future<void> _checkSession() async {
    final session = await ApiService.getUserSession();

    if (!mounted) return;

    if (session != null && session['token']!.isNotEmpty) {
      // Valid session found — go directly to HomeScreen
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HomeScreen(
            userName:  session['userName']  ?? session['userId'] ?? 'User',
            userEmail: session['userEmail'] ?? '',
          ),
        ),
      );
    } else {
      // No session — show login
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [kRedDark, kRed],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: FadeTransition(
          opacity: _fadeAnim,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // App icon
              Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withOpacity(0.6),
                    width: 2,
                  ),
                ),
                child: const Icon(
                  Icons.directions_car_rounded,
                  size: 48,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                "MY AUTOSHOP",
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: 3,
                ),
              ),
              const SizedBox(height: 48),
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
