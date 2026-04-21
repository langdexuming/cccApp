use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncRead, BufReader};

fn strip_utf8_bom(bytes: &[u8]) -> &[u8] {
  if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
    &bytes[3..]
  } else {
    bytes
  }
}

fn decode_utf16(bytes: &[u8]) -> Option<String> {
  if bytes.len() < 2 || bytes.len() % 2 != 0 {
    return None;
  }

  if bytes.starts_with(&[0xff, 0xfe]) {
    let words: Vec<u16> = bytes[2..]
      .chunks_exact(2)
      .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
      .collect();
    return Some(String::from_utf16_lossy(&words));
  }

  if bytes.starts_with(&[0xfe, 0xff]) {
    let words: Vec<u16> = bytes[2..]
      .chunks_exact(2)
      .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
      .collect();
    return Some(String::from_utf16_lossy(&words));
  }

  let nul_on_odd = bytes
    .chunks_exact(2)
    .take(16)
    .filter(|chunk| chunk[1] == 0)
    .count();
  if nul_on_odd >= 4 {
    let words: Vec<u16> = bytes
      .chunks_exact(2)
      .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
      .collect();
    return Some(String::from_utf16_lossy(&words));
  }

  let nul_on_even = bytes
    .chunks_exact(2)
    .take(16)
    .filter(|chunk| chunk[0] == 0)
    .count();
  if nul_on_even >= 4 {
    let words: Vec<u16> = bytes
      .chunks_exact(2)
      .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
      .collect();
    return Some(String::from_utf16_lossy(&words));
  }

  None
}

fn trim_front_to_char_boundary(text: &mut String, max_len: usize) {
  if text.len() <= max_len {
    return;
  }

  let min_index = text.len() - max_len;
  let split_index = text
    .char_indices()
    .find(|(idx, _)| *idx >= min_index)
    .map(|(idx, _)| idx)
    .unwrap_or(text.len());
  text.drain(..split_index);
}

pub fn decode_text(bytes: &[u8]) -> String {
  let bytes = strip_utf8_bom(bytes);
  if bytes.is_empty() {
    return String::new();
  }

  if let Ok(text) = std::str::from_utf8(bytes) {
    return text.to_string();
  }

  if let Some(text) = decode_utf16(bytes) {
    return text;
  }

  #[cfg(windows)]
  {
    let (text, _, _) = encoding_rs::GBK.decode(bytes);
    text.into_owned()
  }

  #[cfg(not(windows))]
  {
    String::from_utf8_lossy(bytes).into_owned()
  }
}

pub fn decode_trimmed(bytes: &[u8]) -> String {
  decode_text(bytes).trim().to_string()
}

pub async fn read_decoded_line<R: AsyncBufRead + Unpin>(
  reader: &mut R,
  buffer: &mut Vec<u8>,
) -> std::io::Result<Option<String>> {
  buffer.clear();
  let read = reader.read_until(b'\n', buffer).await?;
  if read == 0 {
    return Ok(None);
  }
  Ok(Some(decode_text(buffer)))
}

pub async fn collect_decoded_output<R: AsyncRead + Unpin>(reader: R, max_len: usize) -> String {
  let mut reader = BufReader::new(reader);
  let mut output = String::new();
  let mut buffer = Vec::new();

  loop {
    match read_decoded_line(&mut reader, &mut buffer).await {
      Ok(Some(line)) => {
        output.push_str(&line);
        trim_front_to_char_boundary(&mut output, max_len);
      }
      Ok(None) | Err(_) => break,
    }
  }

  output
}
