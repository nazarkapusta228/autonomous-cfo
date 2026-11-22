import React from 'react';

export default function Snail({ pose }) {
  return (
    <svg
      className={'cfo-snail ' + pose}
      viewBox="0 0 132 76"
      aria-hidden="true"
    >
      <ellipse cx="65" cy="69" rx="55" ry="4" fill="#15241d" opacity=".2" />
      <path
        d="M8 63Q29 65 40 51L73 50Q78 26 94 27Q111 25 115 40Q119 55 105 63Q87 73 19 68Z"
        fill="#c9d8ad"
        stroke="#34483a"
        strokeWidth="2"
      />
      <g className="snail-shell">
      <circle
        cx="48"
        cy="44"
        r="23"
        fill="#c98e67"
        stroke="#553f34"
        strokeWidth="2"
      />
      <path
        d="M33 53C19 30 56 17 62 39S38 63 37 45S55 35 51 45Q48 50 44 46"
        fill="none"
        stroke="#81533d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      </g>
      <g className="snail-face">
        <g fill="white" stroke="#435446">
          <ellipse cx="93" cy="39" rx="5" ry="6" />
          <ellipse className="wink" cx="106" cy="38" rx="5" ry="6" />
        </g>
        <g className="pupils" fill="#26322c">
          <circle cx="94" cy="40" r="2.4" />
          <circle className="wink" cx="107" cy="39" r="2.4" />
        </g>
        <path
          className="snail-smile"
          d="M94 50Q101 57 109 48"
          fill="none"
          stroke="#435446"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g className="snail-hat" transform="rotate(7 94 27)">
          <path
            d="M76 27L81 11Q83 5 90 10Q93 12 99 8Q107 6 110 26Z"
            fill="#cd3038"
          />
          <path d="M78 21Q93 26 109 20L111 27L76 29Z" fill="#422e32" />
          <path
            d="M66 26Q80 21 89 26Q104 29 119 23Q128 24 120 30Q96 40 69 32Q61 29 66 26"
            fill="#df3940"
          />
        </g>
      </g>
    </svg>
  );
}
