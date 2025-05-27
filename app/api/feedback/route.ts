import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { score, input, output } = body;

    // Validate the request
    if (typeof score !== 'number' || (score !== 0 && score !== 1)) {
      return NextResponse.json(
        { error: 'Score must be 0 or 1' },
        { status: 400 }
      );
    }

    if (!input || !output) {
      return NextResponse.json(
        { error: 'Input and output are required' },
        { status: 400 }
      );
    }

    // Log feedback to console for debugging (optional)
    console.log(`User feedback received: ${score === 1 ? 'positive' : 'negative'} for ${input}`);

    // Generate a simple feedback ID for response consistency
    const feedbackId = `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return NextResponse.json({ success: true, feedbackId });
  } catch (error) {
    console.error('Error processing feedback:', error);
    return NextResponse.json(
      { error: 'Failed to process feedback' },
      { status: 500 }
    );
  }
} 